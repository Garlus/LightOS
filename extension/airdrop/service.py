#!/usr/bin/env python3
"""Session-owned AirDrop controller and native file transfer UI.

Shell talks JSON lines over stdin/stdout. Closing stdin stops all owned work.
The radio (OWL or a native AWDL driver) is provided by the operating system.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import threading

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
from gi.repository import Adw, Gio, GLib, GLibUnix, Gtk

from transport import Client, interface_address, validate_files

BASE = Path(__file__).resolve().parent


def idle(callback, *args):
    def run():
        callback(*args)
        return GLib.SOURCE_REMOVE
    GLib.idle_add(run)


class Controller(Adw.Application):
    def __init__(self, interface, standalone=False):
        super().__init__(application_id='dev.lightos.AirDrop', flags=Gio.ApplicationFlags.NON_UNIQUE)
        self.interface = interface
        self.standalone = standalone
        self.enabled = False
        self.busy = False
        self.receiver = None
        self.zeroconf = self.advertisement = self.browser = None
        self.window = None
        self.files = []
        self.peers = {}
        self.probing = set()
        self.client = None
        self.cancelled = threading.Event()
        self.stopping = False
        self.generation = 0
        self.launch_lock = threading.Lock()
        self.pending = []
        self.input_buffer = b''
        self.downloads = Path(GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD) or Path.home() / 'Downloads')
        self.session = tempfile.TemporaryDirectory(prefix='session-', dir=self.runtime_directory())
        self.socket_path = str(Path(self.session.name) / 'receiver.sock')
        self.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.listener.bind(self.socket_path)
        os.chmod(self.socket_path, 0o600)
        self.listener.listen(4)
        self.listener.settimeout(1)
        self.connect('activate', self.activate_controller)

    @staticmethod
    def runtime_directory():
        path = Path(GLib.get_user_runtime_dir()) / 'lightos-airdrop'
        path.mkdir(mode=0o700, parents=True, exist_ok=True)
        return str(path)

    def emit_state(self, message='', error=False):
        print(json.dumps({'event': 'state', 'enabled': self.enabled, 'busy': self.busy,
                          'message': message, 'error': error}), flush=True)
        if self.window:
            self.detail.set_text(message or ('Für Geräte in der Nähe sichtbar.' if self.enabled else 'Empfang ist ausgeschaltet.'))

    def activate_controller(self, _app):
        self.hold()
        if not self.standalone:
            GLib.io_add_watch(sys.stdin.fileno(), GLib.IO_IN | GLib.IO_HUP | GLib.IO_ERR, self.read_input)
        GLibUnix.signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, self.shutdown_controller)
        threading.Thread(target=self.listen, daemon=True).start()
        GLib.timeout_add_seconds(1, self.watch_receiver)
        self.emit_state()
        if self.standalone:
            self.show_send()

    def read_input(self, _fd, condition):
        if condition & (GLib.IO_HUP | GLib.IO_ERR):
            self.shutdown_controller()
            return GLib.SOURCE_REMOVE
        chunk = os.read(sys.stdin.fileno(), 65536)
        if not chunk:
            self.shutdown_controller()
            return GLib.SOURCE_REMOVE
        self.input_buffer += chunk
        if len(self.input_buffer) > 65536:
            self.shutdown_controller()
            return GLib.SOURCE_REMOVE
        while b'\n' in self.input_buffer:
            line, self.input_buffer = self.input_buffer.split(b'\n', 1)
            try:
                command = json.loads(line)
                action = command.get('action')
                if action == 'set-enabled':
                    self.set_enabled(command.get('enabled') is True)
                elif action == 'send-dialog':
                    self.show_send()
                elif action == 'quit':
                    self.shutdown_controller()
            except (ValueError, AttributeError):
                self.emit_state('Ungültiger AirDrop-Befehl.', True)
        return GLib.SOURCE_CONTINUE

    def prerequisites(self):
        missing = [name for name in ['libarchive', 'zeroconf'] if importlib.util.find_spec(name) is None]
        if missing:
            return 'AirDrop benötigt python3-libarchive-c und python3-zeroconf. Einrichtung: README → AirDrop.'
        if not interface_address(self.interface):
            return 'Kein AWDL verfügbar. Für AirDrop muss OWL oder ein AWDL-Treiber laufen.'
        return None

    def set_enabled(self, enabled):
        if self.busy or self.stopping or enabled == self.enabled:
            return
        if enabled:
            if error := self.prerequisites():
                self.emit_state(error, True)
                return
            self.busy = True
            self.generation += 1
            generation = self.generation
            self.emit_state('AirDrop wird eingeschaltet …')
            threading.Thread(target=self.start_receiver, args=(generation,)).start()
        else:
            self.stop_receiver()
            self.emit_state()

    def start_receiver(self, generation):
        zeroconf = None
        try:
            from zeroconf import IPVersion, ServiceInfo, Zeroconf
            self.downloads.mkdir(parents=True, exist_ok=True)
            address = interface_address(self.interface)
            sid = Path(f'/sys/class/net/{self.interface}/address').read_text().strip().replace(':', '')
            zeroconf = Zeroconf(interfaces=[address], ip_version=IPVersion.V6Only)
            advertisement = ServiceInfo('_airdrop._tcp.local.', f'{sid}._airdrop._tcp.local.',
                addresses=[socket.inet_pton(socket.AF_INET6, address)], port=8771,
                properties={'flags': '0x3f9'}, server=f'lightos-{sid}.local.')
            environment = dict(os.environ, LIGHTOS_AIRDROP_SOCKET=self.socket_path,
                LIGHTOS_AIRDROP_GENERATION=str(generation))
            for key in ['OMDROP_DEBUG', 'OMDROP_DEBUG_SENSITIVE', 'OMDROP_PEERCERT']:
                environment.pop(key, None)
            with self.launch_lock:
                if self.stopping or generation != self.generation:
                    zeroconf.close()
                    return
                receiver = subprocess.Popen([sys.executable, '-B', str(BASE / 'vendor/receiver.py'),
                    '--iface', self.interface, '--outdir', str(self.downloads),
                    '--config', str(BASE / 'receiver-defaults.toml')], env=environment,
                    stdin=subprocess.DEVNULL, stdout=sys.stderr, stderr=sys.stderr)
                self.receiver, self.zeroconf, self.advertisement = receiver, zeroconf, advertisement
            idle(self.receiver_started, generation, receiver, zeroconf, advertisement)
        except Exception as exception:
            if zeroconf:
                zeroconf.close()
            idle(self.start_failed, generation, str(exception))

    def receiver_started(self, generation, receiver, zeroconf, advertisement):
        if self.stopping or generation != self.generation:
            return
        # Readiness is reported by the bound TLS server through the private IPC.
        GLib.timeout_add_seconds(12, self.check_start_deadline, generation)

    def check_start_deadline(self, generation):
        if generation == self.generation and self.busy and not self.enabled:
            self.start_failed(generation, 'Der Empfangsdienst konnte nicht gestartet werden.')
        return GLib.SOURCE_REMOVE

    def start_failed(self, generation, message):
        if generation != self.generation or self.stopping:
            return
        self.stop_receiver()
        self.emit_state(f'AirDrop konnte nicht gestartet werden: {message}', True)

    def watch_receiver(self):
        if self.stopping:
            return GLib.SOURCE_REMOVE
        if self.receiver and self.receiver.poll() is not None:
            self.start_failed(self.generation, 'Der Empfangsdienst wurde beendet.')
        elif self.enabled and not interface_address(self.interface):
            self.start_failed(self.generation, 'Die AWDL-Verbindung wurde getrennt.')
        return GLib.SOURCE_CONTINUE

    def stop_receiver(self):
        self.generation += 1
        self.enabled = self.busy = False
        self.cancel_send()
        for event, response, dialog in list(self.pending):
            dialog.close()
            response['accepted'] = False
            event.set()
        self.pending.clear()
        with self.launch_lock:
            receiver, self.receiver = self.receiver, None
            zeroconf, advertisement = self.zeroconf, self.advertisement
            self.zeroconf = self.advertisement = None
        if receiver:
            receiver.terminate()
            def reap():
                try:
                    receiver.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    receiver.kill()
                    receiver.wait()
            threading.Thread(target=reap).start()
        self.stop_browsing()
        if zeroconf:
            def close():
                if advertisement:
                    try:
                        zeroconf.unregister_service(advertisement)
                    except Exception:
                        pass
                zeroconf.close()
            threading.Thread(target=close).start()
        self.peers.clear()
        self.refresh_peers()

    def listen(self):
        while not self.stopping:
            try:
                connection, _ = self.listener.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            threading.Thread(target=self.handle_connection, args=(connection,), daemon=True).start()

    def handle_connection(self, connection):
        with connection:
            connection.settimeout(65)
            try:
                with connection.makefile('rb') as stream:
                    data = json.loads(stream.readline(65536))
                event, response = threading.Event(), {'accepted': False}
                idle(self.receiver_event, data, event, response)
                event.wait(60)
                connection.sendall((json.dumps(response) + '\n').encode())
            except (OSError, ValueError):
                pass

    def receiver_event(self, data, event, response):
        if data.get('generation') != self.generation or self.stopping:
            event.set()
            return
        kind = data.get('event')
        if kind == 'ready' and self.receiver and not self.stopping:
            generation = self.generation
            zeroconf, advertisement = self.zeroconf, self.advertisement
            def advertise():
                try:
                    zeroconf.register_service(advertisement)
                    if generation != self.generation or self.stopping:
                        zeroconf.unregister_service(advertisement)
                    else:
                        idle(self.receive_ready, generation)
                except Exception as exception:
                    idle(self.start_failed, generation, str(exception))
            threading.Thread(target=advertise, daemon=True).start()
        elif kind == 'ask' and self.enabled and not self.stopping:
            if len(self.pending) >= 3:
                event.set()
                return
            names = ', '.join(str(name) for name in data.get('files', [])[:5])
            count = data.get('count', 1)
            description = f'{data.get("sender", "Unbekannt")} möchte {count} Datei(en) oder Links senden.'
            if names:
                description += '\n\n' + names
            dialog = Adw.AlertDialog(heading='AirDrop empfangen?', body=description)
            dialog.add_response('cancel', 'Ablehnen')
            dialog.add_response('accept', 'Annehmen')
            dialog.set_response_appearance('accept', Adw.ResponseAppearance.SUGGESTED)
            dialog.set_default_response('cancel')
            dialog.set_close_response('cancel')
            parent = self.ensure_window()
            request = (event, response, dialog)
            self.pending.append(request)
            def answered(_dialog, answer):
                response['accepted'] = answer == 'accept' and self.enabled
                if request in self.pending:
                    self.pending.remove(request)
                event.set()
            dialog.connect('response', answered)
            dialog.present(parent)
            def expire():
                if not event.is_set():
                    dialog.close()
                return GLib.SOURCE_REMOVE
            GLib.timeout_add_seconds(55, expire)
            return
        elif kind == 'received' and self.enabled:
            files = data.get('files', [])
            print(json.dumps({'event': 'received', 'count': len(files), 'directory': str(self.downloads)}), flush=True)
            if self.window:
                self.detail.set_text(f'{len(files)} Datei(en) in Downloads gespeichert.')
        response['accepted'] = kind in ('ready', 'received')
        event.set()

    def receive_ready(self, generation):
        if generation != self.generation or self.stopping:
            return
        self.enabled, self.busy = True, False
        self.emit_state()
        if self.window:
            self.refresh_peers()
            self.start_browsing()

    def ensure_window(self):
        if not self.window:
            self.window = Adw.ApplicationWindow(application=self, title='AirDrop',
                default_width=560, default_height=560)
            toolbar = Adw.ToolbarView()
            toolbar.add_top_bar(Adw.HeaderBar())
            scroll = Gtk.ScrolledWindow(vexpand=True, hscrollbar_policy=Gtk.PolicyType.NEVER)
            clamp = Adw.Clamp(maximum_size=600)
            content = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=24,
                margin_top=24, margin_bottom=24, margin_start=24, margin_end=24)
            title = Gtk.Label(label='Dateien senden', xalign=0)
            title.add_css_class('title-1')
            content.append(title)
            self.detail = Gtk.Label(wrap=True, xalign=0)
            self.detail.add_css_class('dim-label')
            content.append(self.detail)
            group = Adw.PreferencesGroup(title='Dateien')
            self.file_row = Adw.ActionRow(title='Keine Dateien ausgewählt')
            self.pick = Gtk.Button(label='Auswählen …', valign=Gtk.Align.CENTER)
            self.pick.connect('clicked', self.pick_files)
            self.file_row.add_suffix(self.pick)
            group.add(self.file_row)
            content.append(group)
            self.peer_group = Adw.PreferencesGroup(title='Geräte in der Nähe',
                description='Am Apple-Gerät AirDrop öffnen und „Für jeden“ aktivieren.')
            self.peer_list = Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE)
            self.peer_list.add_css_class('boxed-list')
            self.peer_group.add(self.peer_list)
            content.append(self.peer_group)
            self.progress = Gtk.ProgressBar(visible=False)
            content.append(self.progress)
            self.cancel_button = Gtk.Button(label='Übertragung abbrechen', visible=False)
            self.cancel_button.connect('clicked', lambda _button: self.cancel_send())
            content.append(self.cancel_button)
            self.retry = Gtk.Button(label='AirDrop einschalten')
            self.retry.connect('clicked', lambda _button: self.set_enabled(True))
            content.append(self.retry)
            clamp.set_child(content)
            scroll.set_child(clamp)
            toolbar.set_content(scroll)
            self.window.set_content(toolbar)
            self.window.connect('close-request', self.close_window)
            self.refresh_peers()
            self.detail.set_text('Für Geräte in der Nähe sichtbar.' if self.enabled else 'Empfang ist ausgeschaltet.')
        self.window.present()
        return self.window

    def show_send(self):
        self.ensure_window()
        self.emit_state()
        if not self.enabled:
            self.set_enabled(True)
        else:
            self.start_browsing()

    def close_window(self, _window):
        self.cancel_send()
        self.stop_browsing()
        for event, response, dialog in list(self.pending):
            response['accepted'] = False
            event.set()
            dialog.close()
        self.pending.clear()
        self.window = None
        if self.standalone:
            self.shutdown_controller()
        return False

    def pick_files(self, _button):
        dialog = Gtk.FileDialog(title='Dateien für AirDrop auswählen')
        def selected(file_dialog, result):
            try:
                model = file_dialog.open_multiple_finish(result)
                paths = [model.get_item(index).get_path() for index in range(model.get_n_items())]
                if any(path is None for path in paths):
                    raise ValueError('Bitte lokale Dateien auswählen.')
                files = validate_files(paths)
                if self.window:
                    self.files = files
                    self.file_row.set_title(f'{len(files)} Datei(en) ausgewählt')
                    self.file_row.set_subtitle(', '.join(Path(path).name for path in files))
                    self.refresh_peers()
            except GLib.Error:
                pass  # chooser cancellation
            except ValueError as error:
                if self.window:
                    self.detail.set_text(str(error))
        dialog.open_multiple(self.window, None, selected)

    def start_browsing(self):
        if self.browser or not self.enabled or not self.window:
            return
        from zeroconf import ServiceBrowser
        self.browser = ServiceBrowser(self.zeroconf, '_airdrop._tcp.local.', handlers=[self.service_changed])
        self.refresh_peers()
        generation = self.generation
        def refresh():
            if not self.browser or generation != self.generation:
                return GLib.SOURCE_REMOVE
            for name in list(self.peers):
                self.probe(name, generation)
            return GLib.SOURCE_CONTINUE
        GLib.timeout_add_seconds(5, refresh)

    def stop_browsing(self):
        if self.browser:
            self.browser.cancel()
            self.browser = None
        self.peers.clear()

    def service_changed(self, zeroconf, service_type, name, state_change):
        from zeroconf import ServiceStateChange
        if self.advertisement and name == self.advertisement.name:
            return
        if state_change == ServiceStateChange.Removed:
            idle(self.remove_peer, name)
        else:
            self.probe(name, self.generation)

    def remove_peer(self, name):
        self.peers.pop(name, None)
        self.refresh_peers()

    def probe(self, name, generation):
        if name in self.probing:
            return
        self.probing.add(name)
        zeroconf = self.zeroconf
        def resolve():
            peer = None
            try:
                info = zeroconf.get_service_info('_airdrop._tcp.local.', name, timeout=2000)
                if info:
                    for host in info.parsed_addresses():
                        try:
                            client = Client(host, info.port, self.interface)
                            display_name = client.discover()
                            if display_name:
                                peer = {'name': str(display_name)[:128], 'host': host, 'port': info.port}
                                break
                        except Exception:
                            continue
            finally:
                idle(self.peer_resolved, name, peer, generation)
        threading.Thread(target=resolve, daemon=True).start()

    def peer_resolved(self, name, peer, generation):
        self.probing.discard(name)
        if generation != self.generation or not self.browser:
            return
        if peer:
            self.peers[name] = peer
        else:
            self.peers.pop(name, None)
        self.refresh_peers()

    def refresh_peers(self):
        if not self.window:
            return
        self.retry.set_visible(not self.enabled)
        self.retry.set_sensitive(not self.busy)
        self.peer_list.remove_all()
        if not self.peers:
            self.peer_list.append(Adw.ActionRow(title='Noch keine Geräte gefunden',
                subtitle='Geräte erscheinen, sobald ihr AirDrop-Empfang bereit ist.'))
        for peer in sorted(self.peers.values(), key=lambda item: item['name']):
            row = Adw.ActionRow(title=peer['name'])
            button = Gtk.Button(label='Senden', valign=Gtk.Align.CENTER,
                sensitive=bool(self.files) and self.client is None)
            button.add_css_class('suggested-action')
            button.connect('clicked', lambda _button, target=peer: self.send_files(target))
            row.add_suffix(button)
            self.peer_list.append(row)

    def send_files(self, peer):
        if self.client or not self.enabled:
            return
        try:
            files = validate_files(self.files)
            self.client = Client(peer['host'], peer['port'], self.interface)
        except Exception as error:
            self.detail.set_text(str(error))
            return
        self.cancelled = threading.Event()
        client, cancelled = self.client, self.cancelled
        generation = self.generation
        self.progress.set_visible(True)
        self.cancel_button.set_visible(True)
        self.pick.set_sensitive(False)
        self.refresh_peers()
        def pulse():
            if self.client is not client or not self.window:
                return GLib.SOURCE_REMOVE
            self.progress.pulse()
            return GLib.SOURCE_CONTINUE
        GLib.timeout_add(100, pulse)
        def phase(message):
            idle(self.send_phase, client, message)
        def send():
            try:
                client.send(files, phase, cancelled)
                message = 'Dateien wurden gesendet.'
                success = True
            except Exception as error:
                message = 'Übertragung abgebrochen.' if cancelled.is_set() else f'Senden fehlgeschlagen: {error}'
                success = False
            idle(self.send_finished, client, message, success, generation)
        threading.Thread(target=send, daemon=True).start()

    def send_phase(self, client, message):
        if self.client is client and self.window:
            self.detail.set_text(message)

    def cancel_send(self):
        self.cancelled.set()
        connection = self.client.connection if self.client else None
        sock = connection.sock if connection else None
        if sock:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass

    def send_finished(self, client, message, success, generation):
        if self.client is not client:
            return
        self.client = None
        if self.stopping:
            return
        if generation == self.generation:
            print(json.dumps({'event': 'sent', 'success': success, 'message': message}), flush=True)
        if self.window:
            self.detail.set_text(message)
            self.progress.set_visible(False)
            self.cancel_button.set_visible(False)
            self.pick.set_sensitive(True)
            self.refresh_peers()

    def shutdown_controller(self):
        if self.stopping:
            return GLib.SOURCE_REMOVE
        self.stopping = True
        self.stop_receiver()
        self.listener.close()
        self.session.cleanup()
        self.quit()
        return GLib.SOURCE_REMOVE


if __name__ == '__main__':
    GLib.set_application_name('AirDrop')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--interface', default='awdl0')
    parser.add_argument('--send', action='store_true', help='Open a standalone send window')
    args = parser.parse_args()
    controller = Controller(args.interface, standalone=args.send)
    sys.exit(controller.run([]))
