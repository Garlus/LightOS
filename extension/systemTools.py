#!/usr/bin/env python3
"""LightOS utility windows. GTK stays outside the GNOME Shell process.

Commands use argument arrays. Package removals and cache disposal require a
concrete per-item confirmation. No root command or automatic installation.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading

import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Adw', '1')
from gi.repository import Adw, Gdk, Gio, GLib, Gtk

TITLES = {'updates': 'App Updates', 'cleanup': 'Aufräumen', 'brew': 'Homebrew',
          'uninstall': 'Deinstallierungsprogramm', 'ocr': 'Text vom Bildschirm kopieren',
          'ocr-file': 'Text vom Bildschirm kopieren'}


def brew_path():
    return shutil.which('brew') or next((str(p) for p in (
        Path('/home/linuxbrew/.linuxbrew/bin/brew'), Path.home() / '.linuxbrew/bin/brew')
        if p.is_file() and os.access(p, os.X_OK)), None)


def command(argv, timeout=180):
    env = dict(os.environ, LC_ALL='C.UTF-8', HOMEBREW_NO_AUTO_UPDATE='1',
               HOMEBREW_NO_ANALYTICS='1', HOMEBREW_NO_ENV_HINTS='1', HOMEBREW_NO_ASK='1')
    result = subprocess.run(argv, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout, env=env, stdin=subprocess.DEVNULL)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout or f'Exit {result.returncode}').strip()[-3000:])
    return result.stdout.strip()


def flatpaks(updates=False):
    if not shutil.which('flatpak'):
        return []
    apps = []
    for scope in ('--user', '--system'):
        argv = ['flatpak', 'remote-ls' if updates else 'list', scope, '--app',
                '--columns=application,name,version']
        if updates:
            argv.append('--updates')
        for line in command(argv).splitlines():
            fields = line.split('\t')
            if len(fields) >= 2:
                app_id, name = fields[:2]
                apps.append({'name': name, 'detail': f'Flatpak · {scope[2:]} · ' +
                             (fields[2] if len(fields) > 2 else app_id),
                             'argv': ['flatpak', 'update' if updates else 'uninstall', scope,
                                      '--noninteractive', app_id]})
    return apps


def brew_items(updates=False):
    brew = brew_path()
    if not brew:
        return []
    if updates:
        data = json.loads(command([brew, 'outdated', '--json=v2']))
        return [{'name': f['name'], 'detail': 'Homebrew · ' + ', '.join(f.get('installed_versions', [])) +
                 ' → ' + f.get('current_version', ''), 'argv': [brew, 'upgrade', f['name']]}
                for f in data.get('formulae', [])]
    data = json.loads(command([brew, 'info', '--json=v2', '--installed']))
    return [{'name': f['name'], 'detail': 'Homebrew · ' +
             ', '.join(i['version'] for i in f.get('installed', [])),
             'argv': [brew, 'uninstall', f['name']]} for f in data.get('formulae', [])]


def cache_candidates():
    # Deliberately bounded: no project cache, browser profiles or arbitrary paths.
    base = Path(GLib.get_user_cache_dir())
    result = []
    for name, title in [('thumbnails', 'Vorschaubilder'), ('gnome-software', 'Software-Katalog')]:
        path = base / name
        if not path.is_dir() or path.is_symlink():
            continue
        size = 0
        for root, dirs, files in os.walk(path, followlinks=False):
            dirs[:] = [d for d in dirs if not (Path(root) / d).is_symlink()]
            for filename in files:
                try:
                    size += (Path(root) / filename).lstat().st_size
                except OSError:
                    pass
        result.append({'name': title, 'detail': f'{GLib.format_size(size)} · {path}', 'path': str(path)})
    return result


class Tools(Adw.Application):
    def __init__(self, mode, image=None):
        super().__init__(application_id='dev.lightos.SystemTools', flags=Gio.ApplicationFlags.NON_UNIQUE)
        self.mode, self.image = mode, image
        self.busy = False
        self.connect('activate', self.activate_window)

    def activate_window(self, _app):
        self.window = Adw.ApplicationWindow(application=self, title=TITLES[self.mode],
                                          default_width=540, default_height=560 if self.mode.startswith('ocr') else 420)
        toolbar = Adw.ToolbarView()
        header = Adw.HeaderBar()
        toolbar.add_top_bar(header)
        self.refresh = Gtk.Button(icon_name='view-refresh-symbolic', tooltip_text='Neu prüfen')
        self.refresh.connect('clicked', lambda _b: self.load())
        header.pack_end(self.refresh)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12,
                      margin_top=12, margin_bottom=12, margin_start=18, margin_end=18)
        self.status = Gtk.Label(wrap=True, xalign=0, css_classes=['dim-label'])
        box.append(self.status)
        self.extra = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=8)
        box.append(self.extra)
        if self.mode == 'brew':
            self.search = Gtk.SearchEntry(placeholder_text='Formel suchen', hexpand=True)
            self.search.connect('activate', lambda _s: self.search_brew())
            self.extra.append(self.search)
            search_button = Gtk.Button(label='Suchen')
            search_button.connect('clicked', lambda _b: self.search_brew())
            self.extra.append(search_button)
        elif self.mode in ('updates', 'uninstall'):
            button = Gtk.Button(label='Systempakete in Software öffnen')
            button.connect('clicked', lambda _b: self.software())
            self.extra.append(button)
        self.list = Gtk.ListBox(selection_mode=Gtk.SelectionMode.NONE, css_classes=['boxed-list'])
        self.list.set_valign(Gtk.Align.START)
        scroll = Gtk.ScrolledWindow(vexpand=True, hscrollbar_policy=Gtk.PolicyType.NEVER, child=self.list)
        box.append(scroll)
        toolbar.set_content(box)
        self.window.set_content(toolbar)
        self.window.present()
        self.load()

    def software(self):
        executable = shutil.which('gnome-software')
        if not executable:
            self.status.set_label('GNOME Software ist nicht installiert.')
            return
        argv = [executable, '--mode=' + ('updates' if self.mode == 'updates' else 'installed')]
        Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE)

    def clear(self):
        self.list.remove_all()

    def background(self, work, done):
        if self.busy:
            return
        self.busy = True
        self.refresh.set_sensitive(False)
        self.list.set_sensitive(False)
        if hasattr(self, 'search'):
            self.extra.set_sensitive(False)
        def run():
            try:
                value, error = work(), None
            except Exception as exc:
                value, error = None, str(exc)
            GLib.idle_add(finish, value, error)
        def finish(value, error):
            self.busy = False
            self.refresh.set_sensitive(True)
            self.list.set_sensitive(True)
            self.extra.set_sensitive(True)
            if error:
                self.status.set_label('Vorgang fehlgeschlagen: ' + error)
            else:
                done(value)
            return GLib.SOURCE_REMOVE
        threading.Thread(target=run, daemon=True).start()

    def row(self, title, subtitle, action=None, label=None):
        row = Adw.ActionRow(title=GLib.markup_escape_text(title),
                            subtitle=GLib.markup_escape_text(subtitle))
        if action:
            button = Gtk.Button(label=label, valign=Gtk.Align.CENTER)
            button.connect('clicked', lambda _b: action())
            row.add_suffix(button)
        self.list.append(row)

    def confirm(self, title, body, action, label='Fortfahren', destructive=False):
        if self.busy:
            return
        dialog = Adw.AlertDialog(heading=title, body=body)
        dialog.add_response('cancel', 'Abbrechen')
        dialog.add_response('yes', label)
        dialog.set_default_response('cancel')
        dialog.set_close_response('cancel')
        if destructive:
            dialog.set_response_appearance('yes', Adw.ResponseAppearance.DESTRUCTIVE)
        dialog.connect('response', lambda _d, response: action() if response == 'yes' else None)
        dialog.present(self.window)

    def execute_item(self, item, install=False):
        title = ('Aktualisieren' if self.mode == 'updates' else 'Installieren' if install else 'Deinstallieren')
        body = item['name'] + '\n' + item['detail']
        if title == 'Deinstallieren':
            body += '\n\nPersönliche Anwendungsdaten bleiben erhalten.'
        def execute():
            self.status.set_label(title + ' …')
            self.background(lambda: command(item['argv'], timeout=1800), lambda _out: self.load())
        self.confirm(item['name'] + ' ' + title.lower() + '?', body, execute,
                     label=title, destructive=title == 'Deinstallieren')

    def load(self):
        if self.busy:
            return
        self.clear()
        if self.mode.startswith('ocr'):
            self.ocr()
        elif self.mode == 'cleanup':
            self.status.set_label('Cache prüfen …')
            self.background(cache_candidates, self.show_cleanup)
        elif self.mode == 'brew' and not brew_path():
            self.extra.set_visible(False)
            self.status.set_label('Homebrew ist nicht installiert. Auf Linux werden Formeln unterstützt.')
            self.row('Homebrew für Linux', 'Installationsanleitung auf brew.sh',
                     lambda: Gio.AppInfo.launch_default_for_uri('https://docs.brew.sh/Homebrew-on-Linux', None),
                     'Anleitung öffnen')
        else:
            self.status.set_label('Installierte Anwendungen prüfen …' if self.mode != 'updates' else
                                  'Verfügbare Updates prüfen …')
            def collect():
                # A backend failure must not hide the other backend's results.
                results, errors = [], []
                sources = [lambda: brew_items(self.mode == 'updates')]
                if self.mode != 'brew':
                    sources.insert(0, lambda: flatpaks(self.mode == 'updates'))
                for source in sources:
                    try:
                        results.extend(source())
                    except Exception as error:
                        errors.append(str(error))
                return results, errors
            self.background(collect, self.show_apps)

    def show_apps(self, result):
        items, errors = result
        self.clear()
        if self.mode == 'updates':
            message = f'{len(items)} verfügbare App-Updates. Flatpak und Homebrew.'
        else:
            message = f'{len(items)} installierte ' + ('Homebrew-Formeln.' if self.mode == 'brew' else
                                                       'Anwendungen. Flatpak und Homebrew.')
        if errors:
            message += '\nEin Paketdienst konnte nicht geprüft werden: ' + '\n'.join(errors)
        elif not items:
            message += '\n' + ('Keine Updates verfügbar.' if self.mode == 'updates' else
                                'Keine verwalteten Anwendungen gefunden.')
        self.status.set_label(message)
        for item in sorted(items, key=lambda i: i['name'].casefold()):
            self.row(item['name'], item['detail'], lambda i=item: self.execute_item(i),
                     'Aktualisieren' if self.mode == 'updates' else 'Entfernen')

    def search_brew(self):
        if self.busy or not brew_path():
            return
        query = self.search.get_text().strip()
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9+_.@/-]{1,79}', query):
            self.status.set_label('Mindestens zwei Zeichen eingeben: Buchstaben, Ziffern oder Paketzeichen.')
            return
        self.status.set_label('Homebrew durchsuchen …')
        def done(output):
            self.clear()
            names = [name for name in output.split() if re.fullmatch(r'[\w+./@-]+', name) and name != '==>']
            self.status.set_label(f'{len(names)} Formeln gefunden.' if names else 'Keine Formel gefunden.')
            for name in names[:50]:
                item = {'name': name, 'detail': 'Homebrew-Formel', 'argv': [brew_path(), 'install', name]}
                self.row(name, item['detail'], lambda i=item: self.execute_item(i, True), 'Installieren')
        self.background(lambda: command([brew_path(), 'search', '--formula', query]), done)

    def show_cleanup(self, items):
        self.clear()
        self.status.set_label('Ausgewählte Caches werden in den Papierkorb verschoben.\n'
                              'Dokumente, App-Einstellungen und Projekt-Caches bleiben erhalten.')
        if not items:
            self.row('Keine Caches gefunden', 'Vorschaubilder und GNOME-Software-Katalog sind bereits leer.')
        for item in items:
            def trash(i=item):
                path = Path(i['path'])
                allowed = {Path(GLib.get_user_cache_dir()) / n for n in ('thumbnails', 'gnome-software')}
                if path not in allowed or path.is_symlink():
                    raise RuntimeError('Cache-Pfad hat sich geändert. Erneut prüfen.')
                Gio.File.new_for_path(str(path)).trash(None)
            def ask(i=item, work=trash):
                self.confirm('Cache in den Papierkorb verschieben?', i['name'] + '\n' + i['detail'] +
                             '\n\nSpeicher wird nach dem Leeren des Papierkorbs freigegeben.',
                             lambda: self.background(work, lambda _v: self.load()),
                             label='In den Papierkorb')
            self.row(item['name'], item['detail'], ask, 'Aufräumen')

    def ocr(self):
        self.refresh.set_visible(False)
        if not shutil.which('tesseract'):
            self.status.set_label('Für lokale Texterkennung wird Tesseract OCR benötigt.')
            self.row('Tesseract installieren', 'Fedora: sudo dnf install tesseract tesseract-langpack-deu\n'
                     'Debian / Ubuntu: sudo apt install tesseract-ocr tesseract-ocr-deu')
            return
        if not self.image:
            self.status.set_label('Im LightOS-Systemmenü „Text vom Bildschirm kopieren“ wählen und einen Bereich markieren.')
            return
        self.status.set_label('Text wird lokal erkannt …')
        def recognize():
            languages = command(['tesseract', '--list-langs'])
            selected = [lang for lang in ('deu', 'eng') if lang in languages.splitlines()]
            argv = ['tesseract', self.image, 'stdout']
            if selected:
                argv.extend(['-l', '+'.join(selected)])
            try:
                return command(argv)
            finally:
                image = Path(self.image)
                if image.parent == Path(GLib.get_tmp_dir()) and image.name.startswith('lightos-ocr-'):
                    image.unlink(missing_ok=True)
        def done(text):
            self.status.set_label('Text erkannt. Prüfen und in die Zwischenablage kopieren.' if text else
                                  'Kein Text erkannt. Einen größeren oder kontrastreicheren Bereich wählen.')
            self.buffer = Gtk.TextBuffer(text=text)
            view = Gtk.TextView(buffer=self.buffer, wrap_mode=Gtk.WrapMode.WORD_CHAR,
                               left_margin=12, right_margin=12, top_margin=12, bottom_margin=12)
            view.set_size_request(-1, 240)
            self.list.append(view)
            def copy():
                value = self.buffer.get_text(self.buffer.get_start_iter(), self.buffer.get_end_iter(), True)
                Gdk.Display.get_default().get_clipboard().set(value)
                self.status.set_label('Text in die Zwischenablage kopiert.')
            self.row('Erkannter Text', 'Die Erkennung findet vollständig auf diesem Rechner statt.', copy, 'Kopieren')
            if text:
                copy()
        self.background(recognize, done)


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'updates'
    if mode not in TITLES:
        raise SystemExit('Unknown tool')
    app = Tools(mode, sys.argv[2] if len(sys.argv) > 2 else None)
    app.run([sys.argv[0]])
