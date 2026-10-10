import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {PALETTES, readPalette, readFile, writeFile} from './palette.js';
import {TerminalThemes} from './terminalThemes.js';
import {ExtraThemes} from './extraThemes.js';

function settingsFor(schema, path = null) {
    const source = Gio.SettingsSchemaSource.get_default();
    const found = source.lookup(schema, true);
    if (!found) return null;
    return new Gio.Settings({settings_schema: found, ...(path ? {path} : {})});
}

// GtkSourceView inherits all Adwaita syntax styles; only colors are replaced.
export function sourceScheme(palette, mode) {
    const c = palette.variants[mode];
    const id = `lightos-${palette.id}-${mode}`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<style-scheme id="${id}" name="LightOS ${palette.id} ${mode}" version="1.0" parent-scheme="Adwaita${mode === 'dark' ? '-dark' : ''}">
  <author>LightOS; palette: T3 Tools Inc.</author>
  <metadata>
    <property name="variant">${mode}</property>
    <property name="${mode === 'dark' ? 'light' : 'dark'}-variant">lightos-${palette.id}-${mode === 'dark' ? 'light' : 'dark'}</property>
  </metadata>
  <style name="text" foreground="${c.codeForeground}" background="${c.codeBackground}"/>
  <style name="selection" foreground="${c.accentForeground}" background="${c.accent}"/>
  <style name="cursor" foreground="${c.terminalCursor}"/>
  <style name="current-line" background="${c.surfaceRaised}"/>
  <style name="line-numbers" foreground="${c.textMuted}" background="${c.codeBackground}"/>
  <style name="search-match" foreground="${c.messageActionForeground}" background="${c.messageAction}"/>
  <style name="def:comment" foreground="${c.textMuted}"/>
  <style name="def:keyword" foreground="${c.accent}"/>
  <style name="def:string" foreground="${c.messageAction}"/>
  <style name="def:number" foreground="${c.warningForeground}"/>
</style-scheme>
`;
}

export class AppThemes {
    constructor(dir, options = {}) {
        this._dir = dir;
        this._terminals = new TerminalThemes(dir);
        this._extra = new ExtraThemes(options.extra);
        this._path = GLib.build_filenamev([GLib.get_user_state_dir(), 'lightos-gnome', 'app-backup.json']);
        this._journal = JSON.parse(readFile(this._path) ?? '{"settings":{},"files":{}}');
    }

    _save() {
        writeFile(this._path, JSON.stringify(this._journal));
    }

    _set(settings, key, value) {
        if (!settings || !settings.settings_schema.has_key(key)) return;
        const schema = settings.schema_id;
        const path = settings.path;
        const id = `${schema}:${path}:${key}`;
        if (!this._journal.settings[id]) this._journal.settings[id] = {
            schema, path, key, original: settings.get_user_value(key)?.print(true) ?? null};
        this._journal.settings[id].last = value.print(true);
        this._save();
        if (!settings.get_value(key).equal(value)) settings.set_value(key, value);
    }

    _file(path, contents) {
        if (!this._journal.files[path]) this._journal.files[path] = {original: readFile(path)};
        this._journal.files[path].last = contents;
        this._save();
        writeFile(path, contents);
    }

    apply(palette, mode, options = {}) {
        this._terminals.apply(palette, mode);
        this._extra.apply(palette, mode, options);
        const library = PALETTES.map(id => readPalette(this._dir, id));
        if (!PALETTES.includes(palette.id)) library.push(palette);
        for (const p of library) {
            for (const variant of ['light', 'dark']) this._file(GLib.build_filenamev([
                GLib.get_user_data_dir(), 'gtksourceview-5', 'styles', `lightos-${p.id}-${variant}.xml`]),
            sourceScheme(p, variant));
        }
        const editor = settingsFor('org.gnome.TextEditor');
        this._set(editor, 'style-scheme', new GLib.Variant('s', `lightos-${palette.id}-${mode}`));

        const c = palette.variants[mode];
        const consoleSettings = settingsFor('org.gnome.Console');
        // Console 50 has an upstream GVariant iterator bug in custom-liveries.
        // Respect its native palette and synchronize the supported appearance key.
        this._set(consoleSettings, 'theme', new GLib.Variant('s', mode === 'dark' ? 'night' : 'day'));
        const profiles = settingsFor('org.gnome.Terminal.ProfilesList');
        if (profiles) {
            this._set(settingsFor('org.gnome.Terminal.Legacy.Settings'), 'theme-variant',
                new GLib.Variant('s', mode));
            const uuid = profiles.get_string('default');
            if (/^[a-f0-9-]{36}$/i.test(uuid)) {
                const profile = settingsFor('org.gnome.Terminal.Legacy.Profile',
                    `/org/gnome/terminal/legacy/profiles:/:${uuid}/`);
                for (const [key, value] of Object.entries({
                    'use-theme-colors': false, 'foreground-color': c.terminalForeground,
                    'background-color': c.terminalBackground, 'cursor-colors-set': true,
                    'cursor-background-color': c.terminalCursor, 'cursor-foreground-color': c.terminalBackground,
                    'highlight-colors-set': true, 'highlight-background-color': c.terminalSelection,
                    'highlight-foreground-color': c.terminalForeground,
                })) this._set(profile, key, new GLib.Variant(typeof value === 'boolean' ? 'b' : 's', value));
            }
        }
    }

    restore() {
        this._terminals.restore();
        this._extra.restore();
        for (const {schema, path, key, original, last} of Object.values(this._journal.settings)) {
            const settings = settingsFor(schema, path);
            if (!settings?.settings_schema.has_key(key) || settings.get_value(key).print(true) !== last) continue;
            if (original === null) settings.reset(key);
            else settings.set_value(key, GLib.Variant.parse(null, original, null, null));
        }
        for (const [path, {original, last}] of Object.entries(this._journal.files)) {
            if (readFile(path) !== last) continue;
            if (original === null) Gio.File.new_for_path(path).delete(null);
            else writeFile(path, original);
        }
        if (Gio.File.new_for_path(this._path).query_exists(null)) Gio.File.new_for_path(this._path).delete(null);
        this._journal = {settings: {}, files: {}};
    }
}
