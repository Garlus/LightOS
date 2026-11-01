import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';

import FontAssets from './fontAssets.js';
import {readFile, writeFile} from './palette.js';

const PROFILES = {
    adwaita: {'font-name': 'Adwaita Sans', 'document-font-name': 'Adwaita Sans',
        'monospace-font-name': 'Adwaita Mono'},
    geist: {'font-name': 'Geist', 'document-font-name': 'Geist',
        'monospace-font-name': 'Geist Mono'},
};

export default class FontProfile {
    constructor(settings, extensionDir, options = {}) {
        this._settings = settings;
        this._interface = options.interfaceSettings ?? new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._ownsInterface = !options.interfaceSettings;
        this._fonts = options.fonts ?? new FontAssets(extensionDir);
        this._read = options.read ?? readFile;
        this._write = options.write ?? writeFile;
        this._path = options.statePath ?? GLib.build_filenamev([
            GLib.get_user_state_dir(), 'lightos-gnome', 'font-profile-backup.json']);
        this._destroyed = false;
        this._changedId = settings.connect('changed::font-profile', () => this.sync());
        try {
            this.sync();
        } catch (error) {
            this.destroy();
            throw error;
        }
    }

    _load() {
        const saved = this._read(this._path);
        if (!saved) return {version: 1, profile: null, keys: {}};
        const journal = JSON.parse(saved);
        if (journal.version !== 1 || !(journal.profile === null || journal.profile in PROFILES) ||
            !journal.keys || typeof journal.keys !== 'object' || Array.isArray(journal.keys))
            throw new Error('Invalid LightOS font profile journal');
        for (const [key, entry] of Object.entries(journal.keys)) {
            if (!(key in PROFILES.geist) || !entry || typeof entry.last !== 'string' ||
                (entry.original !== null && typeof entry.original !== 'string') ||
                !Object.values(PROFILES).some(p => p[key] === Pango.FontDescription.from_string(entry.last).get_family()))
                throw new Error('Invalid LightOS font profile backup entry');
        }
        return journal;
    }

    _save(journal) { this._write(this._path, JSON.stringify(journal)); }
    _userValue(key) { return this._interface.get_user_value(key)?.deep_unpack() ?? null; }

    sync() {
        if (this._destroyed) return;
        const profile = this._settings.get_string('font-profile');
        if (!(profile in PROFILES)) throw new Error(`Unknown LightOS font profile: ${profile}`);
        const journal = this._load();
        if (profile === 'geist') this._fonts.ensure();
        const switching = journal.profile !== profile;
        for (const [key, family] of Object.entries(PROFILES[profile])) {
            if (!this._interface.settings_schema.has_key(key) || !this._interface.is_writable(key)) continue;
            if (!switching && key in journal.keys) continue;
            const current = this._userValue(key);
            const previous = journal.keys[key];
            const original = previous && current === previous.last ? previous.original : current;
            const description = Pango.FontDescription.from_string(this._interface.get_string(key));
            description.set_family(family);
            const last = description.to_string();
            journal.keys[key] = {original, last};
            // Persist before each desktop mutation, including reset provenance.
            this._save(journal);
            if (!this._interface.set_string(key, last)) {
                if (previous) journal.keys[key] = previous;
                else delete journal.keys[key];
                this._save(journal);
            }
        }
        journal.profile = profile;
        this._save(journal);
    }

    _restore() {
        const journal = this._load();
        for (const [key, entry] of Object.entries(journal.keys)) {
            if (this._interface.settings_schema.has_key(key) && this._userValue(key) === entry.last) {
                if (!this._interface.is_writable(key)) continue;
                if (entry.original === null) this._interface.reset(key);
                else if (!this._interface.set_string(key, entry.original)) continue;
            }
            delete journal.keys[key];
            this._save(journal);
        }
        if (Object.keys(journal.keys).length === 0) {
            journal.profile = null;
            this._save(journal);
            // A later user override may still explicitly select a bundled font.
            const stillUsed = Object.keys(PROFILES.geist).some(key =>
                this._interface.settings_schema.has_key(key) &&
                Object.values(PROFILES.geist).includes(
                    Pango.FontDescription.from_string(this._interface.get_string(key)).get_family()));
            if (!stillUsed) this._fonts.destroy();
        }
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._settings.disconnect(this._changedId);
        try { this._restore(); }
        finally { if (this._ownsInterface) this._interface.run_dispose(); }
    }
}
