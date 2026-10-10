import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {PALETTES, readPalette, readFile, writeFile} from './palette.js';

// Verified against Ptyxis 50's schema and native .palette loader:
// https://gitlab.gnome.org/chergert/ptyxis/-/blob/2a8ae6f299bf2b9a3019de3cea11aab96ca07b2e/src/org.gnome.Ptyxis.gschema.xml.in
// https://gitlab.gnome.org/chergert/ptyxis/-/blob/2a8ae6f299bf2b9a3019de3cea11aab96ca07b2e/man/ptyxis.1.in
function settingsFor(schema, path = null) {
    const found = Gio.SettingsSchemaSource.get_default().lookup(schema, true);
    return found ? new Gio.Settings({settings_schema: found, ...(path ? {path} : {})}) : null;
}

// T3 supplies terminal background/foreground/cursor/selection, but no ANSI 16.
// Use its semantic error/warning roles and Grove/Ocean/Iris hues for ANSI so
// command output retains recognisable red, green, blue, violet and cyan.
export function terminalAnsi(palette, mode, library) {
    const c = palette.variants[mode];
    const named = Object.fromEntries(library.map(p => [p.id, p.variants[mode]]));
    const normal = [c.terminalForeground, c.errorForeground, named.grove.accent,
        c.warningForeground, named.ocean.accent, named.iris.accent,
        named.ocean.messageAction, c.textMuted];
    const bright = [c.textMuted, c.error, named.grove.accent,
        mode === 'light' ? c.warningForeground : c.warning, named.ocean.accent, named.iris.messageAction,
        named.ocean.messageAction, c.terminalForeground];
    // Normal black/white remain useful on both backgrounds; no geometry changes.
    if (mode === 'dark') {
        normal[0] = c.canvas;
        normal[7] = c.textMuted;
    }
    return [...normal, ...bright];
}

export function ptyxisPalette(palette, mode, library) {
    const c = palette.variants[mode];
    return `[Palette]\nName=LightOS ${palette.id} ${mode === 'dark' ? 'Dunkel' : 'Hell'}\n` +
        `Foreground=${c.terminalForeground}\nBackground=${c.terminalBackground}\n` +
        `CursorBackground=${c.terminalCursor}\nCursorForeground=${c.terminalBackground}\n` +
        `TitlebarBackground=${c.toolbar}\nTitlebarForeground=${c.toolbarForeground}\n` +
        `BellBackground=${c.warningSurface}\nBellForeground=${c.warningForeground}\n` +
        `SuperuserBackground=${c.errorSurface}\nSuperuserForeground=${c.errorForeground}\n` +
        `RemoteBackground=${c.updateSurface}\nRemoteForeground=${c.updateForeground}\n` +
        terminalAnsi(palette, mode, library).map((color, i) => `Color${i}=${color}\n`).join('');
}

export class TerminalThemes {
    constructor(dir) {
        this._dir = dir;
        this._path = GLib.build_filenamev([GLib.get_user_state_dir(), 'lightos-gnome', 'terminal-backup.json']);
        this._journal = JSON.parse(readFile(this._path) ?? '{"settings":{},"files":{}}');
        this._settings = settingsFor('org.gnome.Ptyxis');
        this._signals = [];
        this._watchProfiles();
    }

    _watchProfiles() {
        if (this._settings && !this._signals.length) {
            // Ptyxis initializes its first profile on first launch; do not create
            // or change profiles on its behalf, only recolor the default profile.
            for (const key of ['default-profile-uuid', 'profile-uuids']) {
                if (this._settings.settings_schema.has_key(key)) this._signals.push(
                    this._settings.connect(`changed::${key}`, () => this._selectProfile()));
            }
        }
    }

    _save() {
        writeFile(this._path, JSON.stringify(this._journal));
    }

    _set(settings, key, value) {
        if (!settings?.settings_schema.has_key(key) || !settings.is_writable(key)) return;
        const schema = settings.schema_id;
        const path = settings.path;
        const id = `${schema}:${path}:${key}`;
        let entry = this._journal.settings[id];
        if (entry && (entry.relinquished || settings.get_value(key).print(true) !== entry.last)) {
            entry.relinquished = true;
            this._save();
            return;
        }
        if (!entry) entry = this._journal.settings[id] = {
            schema, path, key, original: settings.get_user_value(key)?.print(true) ?? null};
        entry.last = value.print(true);
        this._save();
        if (!settings.get_value(key).equal(value)) settings.set_value(key, value);
    }

    _file(path, contents) {
        const current = readFile(path);
        let entry = this._journal.files[path];
        if (entry && (entry.relinquished || current !== entry.last)) {
            entry.relinquished = true;
            this._save();
            return false;
        }
        // A hand-created file with the same name remains untouched.
        if (!entry && current !== null && current !== contents) return false;
        if (!entry) entry = this._journal.files[path] = {original: current};
        entry.last = contents;
        this._save();
        if (current !== contents) writeFile(path, contents);
        return true;
    }

    _selectProfile() {
        if (!this._settings || !this._active || !this._active.usable) return;
        const uuid = this._settings.get_string('default-profile-uuid');
        // Upstream generates 32-character DBus GUIDs; custom IDs also exist.
        // Restrict to a single safe path component rather than assuming UUID-36.
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uuid)) return;
        this._set(settingsFor('org.gnome.Ptyxis.Profile', `/org/gnome/Ptyxis/Profiles/${uuid}/`),
            'palette', new GLib.Variant('s', `lightos-${this._active.id}-${this._active.mode}`));
    }

    apply(palette, mode) {
        if (!['light', 'dark'].includes(mode)) throw new Error('Unknown terminal appearance');
        this._watchProfiles();
        const library = PALETTES.map(id => readPalette(this._dir, id));
        if (!PALETTES.includes(palette.id)) library.push(palette);
        let usable = false;
        for (const p of library) {
            for (const variant of ['light', 'dark']) {
                const installed = this._file(GLib.build_filenamev([GLib.get_user_data_dir(),
                    'org.gnome.Ptyxis', 'palettes', `lightos-${p.id}-${variant}.palette`]),
                ptyxisPalette(p, variant, library));
                if (p.id === palette.id && variant === mode) usable = installed;
            }
        }
        this._active = {id: palette.id, mode, usable};
        this._set(this._settings, 'interface-style', new GLib.Variant('s', mode));
        this._selectProfile();
    }

    restore() {
        for (const id of this._signals) this._settings.disconnect(id);
        this._signals = [];
        this._active = null;
        for (const {schema, path, key, original, last, relinquished} of Object.values(this._journal.settings)) {
            const settings = settingsFor(schema, path);
            if (relinquished || !settings?.settings_schema.has_key(key) ||
                !settings.is_writable(key) || settings.get_value(key).print(true) !== last) continue;
            if (original === null) settings.reset(key);
            else settings.set_value(key, GLib.Variant.parse(null, original, null, null));
        }
        for (const [path, {original, last, relinquished}] of Object.entries(this._journal.files)) {
            if (relinquished || readFile(path) !== last) continue;
            if (original === null) Gio.File.new_for_path(path).delete(null);
            else writeFile(path, original);
        }
        if (Gio.File.new_for_path(this._path).query_exists(null)) Gio.File.new_for_path(this._path).delete(null);
        this._journal = {settings: {}, files: {}};
    }
}
