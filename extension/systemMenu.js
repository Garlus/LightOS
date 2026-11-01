import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Shell from 'gi://Shell';
import {SelectArea} from 'resource:///org/gnome/shell/ui/screenshot.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {WorkspaceMaximize} from './workspaceMaximize.js';

const bytes = value => {
    if (!Number.isFinite(value)) return '—';
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return `${value.toLocaleString('de-DE', {maximumFractionDigits: i ? 1 : 0})} ${units[i]}`;
};

// Native PopupMenu rows retain keyboard focus, submenu navigation and contrast.
export class SystemMenu {
    constructor(extension) {
        this._extension = extension;
        this._history = new Map();
        this._rows = {};
        this._workspace = new WorkspaceMaximize(extension._settings);
        this.button = new PanelMenu.Button(0.0, 'LightOS System');
        this.button.add_child(new St.Icon({icon_name: 'computer-symbolic',
            style_class: 'system-status-icon'}));
        this.button.menu.box.add_style_class_name('lightos-system-menu');
        const quick = Main.panel.statusArea.quickSettings;
        const position = quick.get_parent().get_children().indexOf(quick);
        Main.panel.addToStatusArea('lightos-system', this.button, position, 'right');
        const system = this._section('System', 'computer-symbolic');
        this._row(system, 'cpu', 'CPU');
        this._graph(system, 'cpu', 100);
        this._row(system, 'gpu', 'GPU');
        this._row(system, 'temperature', 'Temperaturen');
        this._row(system, 'memory', 'Arbeitsspeicher');
        this._graph(system, 'memory', 100);
        this._row(system, 'cached', 'Dateien im Cache');
        this._row(system, 'swap', 'Swap-Nutzung');
        this._row(system, 'uptime', 'Aktiv seit');
        const disks = this._section('Festplatten', 'drive-harddisk-symbolic');
        this._volumes = new PopupMenu.PopupMenuSection();
        disks.menu.addMenuItem(this._volumes);
        this._row(disks, 'diskRead', 'Lesen');
        this._row(disks, 'diskWrite', 'Schreiben');
        this._graph(disks, 'disk');
        this._row(disks, 'diskSession', 'Seit Menüstart ↓ / ↑');
        const network = this._section('Netzwerk', 'network-wired-symbolic');
        this._row(network, 'download', 'Download');
        this._row(network, 'upload', 'Upload');
        this._graph(network, 'network');
        this._row(network, 'networkSession', 'Seit Menüstart ↓ / ↑');
        this._row(network, 'ipv4', 'Lokales IPv4');
        this._row(network, 'interface', 'Schnittstellen');
        this.button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Werkzeuge'));
        for (const [mode, title, icon] of [
            ['updates', 'App Updates', 'software-update-available-symbolic'],
            ['cleanup', 'Aufräumen', 'user-trash-symbolic'],
            ['brew', 'Homebrew', 'package-x-generic-symbolic'],
            ['uninstall', 'Deinstallierungsprogramm', 'edit-delete-symbolic'],
            ['ocr', 'Text vom Bildschirm kopieren', 'edit-copy-symbolic'],
        ]) {
            const item = new PopupMenu.PopupImageMenuItem(title, icon);
            item.connect('activate', () => mode === 'ocr' ? this._ocr() : this._launch(mode));
            this.button.menu.addMenuItem(item);
        }
        this.button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem('Fenster'));
        this._toggle = new PopupMenu.PopupSwitchMenuItem('Maximieren auf eigener Arbeitsfläche',
            extension._settings.get_boolean('maximize-new-workspace'));
        this._toggle.connect('toggled', (_item, value) => extension._settings.set_boolean('maximize-new-workspace', value));
        this.button.menu.addMenuItem(this._toggle);
        this._settingsId = extension._settings.connect('changed::maximize-new-workspace', () =>
            this._toggle.setToggleState(extension._settings.get_boolean('maximize-new-workspace')));
        this.button.menu.connect('open-state-changed', (_menu, open) => {
            this._stop();
            if (open) {
                this._sample();
                this._timer = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
                    this._sample(); return GLib.SOURCE_CONTINUE;
                });
            }
        });
    }

    _section(title, icon) {
        const item = new PopupMenu.PopupSubMenuMenuItem(title, true);
        item.icon.icon_name = icon;
        this.button.menu.addMenuItem(item);
        return item;
    }

    _row(section, key, title) {
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        item.add_child(new St.Label({text: title, x_expand: true}));
        const label = new St.Label({text: '—', y_align: Clutter.ActorAlign.CENTER});
        item.add_child(label);
        section.menu.addMenuItem(item);
        this._rows[key] = label;
    }

    _graph(section, key, scale = 0) {
        const row = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        const graph = new St.DrawingArea({height: 28, x_expand: true});
        const values = [];
        graph.connect('repaint', () => {
            const cr = graph.get_context();
            const [width, height] = graph.get_surface_size();
            const color = graph.get_theme_node().get_foreground_color();
            cr.setSourceRGBA(color.red / 255, color.green / 255, color.blue / 255, 0.65);
            cr.setLineWidth(1.25);
            const max = scale || Math.max(1024, ...values);
            values.forEach((value, index) => {
                const x = width * index / 39;
                const y = height - 2 - Math.min(1, value / max) * (height - 4);
                if (index) cr.lineTo(x, y); else cr.moveTo(x, y);
            });
            cr.stroke(); cr.$dispose();
        });
        row.add_child(graph);
        section.menu.addMenuItem(row);
        this._history.set(key, {values, graph});
    }

    _point(key, value) {
        const entry = this._history.get(key);
        entry.values.push(value);
        if (entry.values.length > 40) entry.values.shift();
        entry.graph.queue_repaint();
    }

    _launch(mode, path = null) {
        try {
            const argv = ['python3', this._extension.dir.get_child('systemTools.py').get_path(), mode];
            if (path) argv.push(path);
            Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
        } catch (error) { Main.notifyError('LightOS System', error.message); }
    }

    async _ocr() {
        this.button.menu.close();
        if (!GLib.find_program_in_path('tesseract')) {
            this._launch('ocr'); return;
        }
        if (this._selection) return;
        let file, stream;
        try {
            this._selection = new SelectArea();
            const rect = await this._selection.selectAsync();
            this._selection = null;
            if (!rect || this._destroyed) return;
            [file, stream] = Gio.File.new_tmp('lightos-ocr-XXXXXX.png');
            await new Shell.Screenshot().screenshot_area(rect.x, rect.y, rect.width, rect.height,
                stream.get_output_stream());
            stream.close(null); stream = null;
            if (this._destroyed) file.delete(null);
            else this._launch('ocr-file', file.get_path());
        } catch (error) {
            stream?.close(null);
            if (file?.query_exists(null)) file.delete(null);
            if (!this._destroyed) Main.notifyError('Texterkennung', error.message);
        }
    }

    _clearOcr() {
        if (this._selection) {
            this._selection._grabHelper.ungrab();
            this._selection = null;
        }
    }

    _sample() {
        if (this._process || this._destroyed) return;
        try {
            this._cancellable = new Gio.Cancellable();
            const process = Gio.Subprocess.new(['python3', this._extension.dir.get_child('systemStats.py').get_path()],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
            this._process = process;
            process.communicate_utf8_async(null, this._cancellable, (proc, result) => {
                if (this._process === proc) this._process = null;
                if (this._destroyed) return;
                try {
                    const [, output, error] = proc.communicate_utf8_finish(result);
                    if (!proc.get_successful()) throw new Error(error);
                    this._render(JSON.parse(output));
                } catch (error) {
                    if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        this._rows.cpu.text = 'Messung nicht verfügbar';
                }
            });
        } catch (error) { this._rows.cpu.text = 'Python 3 fehlt'; }
    }

    _render(data) {
        const now = GLib.get_monotonic_time() / 1e6;
        const previous = this._previous;
        const elapsed = previous ? now - previous.time : 0;
        const text = (key, value) => this._rows[key].text = value;
        const cpuDelta = previous && data.cpu && previous.data.cpu ? data.cpu.total - previous.data.cpu.total : 0;
        const cpu = cpuDelta > 0 ? Math.max(0, Math.min(100,
            100 * (1 - (data.cpu.idle - previous.data.cpu.idle) / cpuDelta))) : null;
        text('cpu', cpu === null ? 'Wird gemessen …' : `${Math.round(cpu)} %`);
        if (cpu !== null) this._point('cpu', cpu);
        text('gpu', data.gpu.length ? data.gpu.map(g => `${g.name} ${g.busy} %`).join(' · ') : 'Kein Sensor');
        text('temperature', data.temperatures.length ? data.temperatures.slice(0, 2)
            .map(t => `${t.name} ${Math.round(t.celsius)} °C`).join(' · ') : 'Keine Sensoren');
        const m = data.memory ?? {};
        text('memory', `${bytes(m.total - m.available)} / ${bytes(m.total)}`);
        this._point('memory', m.total ? 100 * (1 - m.available / m.total) : 0);
        text('cached', bytes(m.cached)); text('swap', bytes(m.swapTotal - m.swapFree));
        text('uptime', data.uptime === undefined ? '—' : `${Math.floor(data.uptime / 3600)} h ${Math.floor(data.uptime / 60) % 60} min`);
        const volumes = JSON.stringify(data.filesystems);
        if (volumes !== this._volumeSignature) {
            this._volumeSignature = volumes;
            this._volumes.removeAll();
            for (const volume of data.filesystems.slice(0, 4)) {
                const row = new PopupMenu.PopupMenuItem(`${volume.path}  ·  ${Math.round(100 * (1 - volume.free / volume.total))} % belegt`);
                row.connect('activate', () => Gio.AppInfo.launch_default_for_uri(`file://${GLib.uri_escape_string(volume.path, '/', false)}`, null));
                this._volumes.addMenuItem(row);
                const detail = new PopupMenu.PopupMenuItem(`${bytes(volume.free)} frei / ${bytes(volume.total)}`, {reactive: false});
                this._volumes.addMenuItem(detail);
            }
        }
        for (const [collection, fields, keys, graph] of [
            ['network', ['rx', 'tx'], ['download', 'upload', 'networkSession'], 'network'],
            ['disks', ['read', 'write'], ['diskRead', 'diskWrite', 'diskSession'], 'disk'],
        ]) {
            const current = new Map(data[collection].map(item => [item.name, item]));
            const old = new Map((previous?.data[collection] ?? []).map(item => [item.name, item]));
            this._totals ??= {network: [0, 0], disks: [0, 0]};
            const rates = fields.map((field, i) => {
                const delta = [...current].reduce((sum, [name, item]) => sum +
                    (old.has(name) ? Math.max(0, item[field] - old.get(name)[field]) : 0), 0);
                this._totals[collection][i] += delta;
                const rate = elapsed > 0 ? delta / elapsed : null;
                text(keys[i], rate === null ? 'Wird gemessen …' : `${bytes(rate)}/s`);
                return rate ?? 0;
            });
            text(keys[2], this._totals[collection].map(bytes).join(' / '));
            if (elapsed) this._point(graph, rates[0] + rates[1]);
        }
        text('ipv4', data.network.filter(n => n.ipv4).map(n => n.ipv4).join(' · ') || 'Keine Adresse');
        text('interface', data.network.map(n => n.name).join(', ') || 'Keine Verbindung');
        this._previous = {time: now, data};
    }

    _stop() {
        if (this._timer) GLib.source_remove(this._timer);
        this._timer = 0;
        this._previous = null;
        this._cancellable?.cancel();
        this._process?.force_exit();
        this._process = null;
    }

    destroy() {
        this._destroyed = true;
        this._stop(); this._clearOcr();
        this._extension._settings.disconnect(this._settingsId);
        this._workspace.destroy();
        this.button.destroy();
    }
}
