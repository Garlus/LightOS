import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import {readFile, writeFile} from './palette.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

const ICON = 'folder-download-symbolic';

const AirDropToggle = GObject.registerClass(class AirDropToggle extends QuickSettings.QuickMenuToggle {
    _init() {
        super._init({title: 'AirDrop', subtitle: 'Aus', iconName: ICON,
            toggleMode: false, menuButtonAccessibleName: 'AirDrop-Menü öffnen'});
        this.menu.setHeader(ICON, 'AirDrop', 'Empfang ausgeschaltet');
        this.sendItem = new PopupMenu.PopupImageMenuItem('Dateien senden …', 'document-send-symbolic');
        this.menu.addMenuItem(this.sendItem);
    }
});

export class AirDrop {
    constructor(directory) {
        this._directory = directory;
        this._destroyed = false;
        this._enabled = false;
        this._desktopPath = GLib.build_filenamev([GLib.get_user_data_dir(), 'applications', 'dev.lightos.AirDrop.desktop']);
        const script = directory.get_child('airdrop').get_child('service.py').get_path();
        const execPath = script.replace(/[\\"`$]/g, character => `\\${character}`).replace(/%/g, '%%');
        const desktop = new GLib.KeyFile();
        for (const [key, value] of Object.entries({Type: 'Application', Name: 'AirDrop', Icon: ICON,
            Exec: `python3 -B "${execPath}" --send`, NoDisplay: 'true'}))
            desktop.set_string('Desktop Entry', key, value);
        this._desktopEntry = `# Managed by LightOS AirDrop\n${desktop.to_data()[0]}`;
        try {
            const previous = readFile(this._desktopPath);
            if (previous === null || previous.startsWith('# Managed by LightOS AirDrop\n'))
                writeFile(this._desktopPath, this._desktopEntry);
        } catch (error) {
            console.error(`LightOS AirDrop application entry: ${error.message}`);
        }
        this._indicator = new QuickSettings.SystemIndicator();
        this._toggle = new AirDropToggle();
        this._indicator.quickSettingsItems.push(this._toggle);
        this._toggle.connect('clicked', () => this._command({action: 'set-enabled', enabled: !this._enabled}));
        this._toggle.sendItem.connect('activate', () => {
            Main.panel.statusArea.quickSettings.menu.close();
            this._command({action: 'send-dialog'});
        });
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
        // No panel icon: AirDrop is a Quick Settings tile only.
    }

    _start() {
        if (this._process || this._destroyed) return;
        const script = this._directory.get_child('airdrop').get_child('service.py').get_path();
        try {
            const process = Gio.Subprocess.new(['python3', '-B', script],
                Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE);
            this._process = process;
            this._input = new Gio.DataOutputStream({base_stream: process.get_stdin_pipe()});
            this._output = new Gio.DataInputStream({base_stream: process.get_stdout_pipe()});
            this._cancellable = new Gio.Cancellable();
            this._read(process, this._output, this._cancellable);
            process.wait_async(null, (object, result) => {
                object.wait_finish(result);
                if (this._process !== process || this._destroyed) return;
                this._clearProcess();
                this._sync({enabled: false, busy: false});
                if (!object.get_successful())
                    Main.notify('AirDrop', 'Der AirDrop-Dienst konnte nicht gestartet werden. Benötigt Python 3, GTK 4 und libadwaita.');
            });
        } catch (error) {
            this._clearProcess();
            Main.notify('AirDrop', `Der AirDrop-Dienst ist nicht verfügbar: ${error.message}`);
        }
    }

    _read(process, output, cancellable) {
        output.read_line_async(0, cancellable, (stream, result) => {
            try {
                const [line] = stream.read_line_finish_utf8(result);
                if (line === null || this._destroyed || this._process !== process) return;
                const event = JSON.parse(line);
                if (event.event === 'state') {
                    this._sync(event);
                    if (event.error) Main.notify('AirDrop', event.message);
                } else if (event.event === 'received') {
                    Main.notify('AirDrop', `${event.count} Datei(en) in ${event.directory} gespeichert.`);
                } else if (event.event === 'sent') {
                    Main.notify('AirDrop', event.message);
                }
                this._read(process, output, cancellable);
            } catch (error) {
                if (!cancellable.is_cancelled()) console.error(`LightOS AirDrop: ${error.message}`);
            }
        });
    }

    _command(command) {
        this._start();
        if (!this._input) return;
        try {
            this._input.put_string(`${JSON.stringify(command)}\n`, null);
        } catch (error) {
            Main.notify('AirDrop', `AirDrop ist nicht verfügbar: ${error.message}`);
        }
    }

    _sync(state) {
        this._enabled = state.enabled;
        this._toggle.checked = state.enabled;
        this._toggle.reactive = !state.busy;
        this._toggle.subtitle = state.busy ? 'Wird eingeschaltet …' : state.enabled ? 'An' : 'Aus';
        this._toggle.menu.setHeader(ICON, 'AirDrop', state.busy ? 'AirDrop wird eingeschaltet …' :
            state.enabled ? 'Für Geräte in der Nähe sichtbar' : 'Empfang ausgeschaltet');
    }

    _clearProcess() {
        this._cancellable?.cancel();
        try { this._input?.close(null); } catch { /* process may have exited */ }
        this._input = this._output = this._process = this._cancellable = null;
    }

    destroy() {
        this._destroyed = true;
        try { this._input?.put_string('{"action":"quit"}\n', null); } catch { /* already exited */ }
        this._clearProcess();
        this._toggle.destroy();
        this._indicator.destroy();
        try {
            if (readFile(this._desktopPath) === this._desktopEntry)
                Gio.File.new_for_path(this._desktopPath).delete(null);
        } catch (error) {
            console.error(`LightOS AirDrop application entry cleanup: ${error.message}`);
        }
    }
}
