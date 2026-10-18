import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {readFile, writeFile} from './palette.js';

// Derived from Findus' reversible font preset. Explicitly opt-in: these are
// desktop interface settings, affecting GTK/Pango applications globally.
const PRESET = {
    'font-rendering': 'manual',
    'font-antialiasing': 'grayscale',
    'font-hinting': 'none',
};

export default class FontRendering {
    constructor(settings, options = {}) {
        this._settings = settings;
        this._interface = options.interfaceSettings ?? new Gio.Settings({
            schema_id: 'org.gnome.desktop.interface',
        });
        this._ownsInterface = !options.interfaceSettings;
        this._read = options.read ?? readFile;
        this._write = options.write ?? writeFile;
        this._path = options.statePath ?? GLib.build_filenamev([
            GLib.get_user_state_dir(), 'lightos-gnome', 'font-rendering-backup.json',
        ]);
        this._active = false;
        this._destroyed = false;
        this._changedId = settings.connect('changed::font-smoothing-enabled', () => this.sync());
        try {
            this.sync();
        } catch (error) {
            settings.disconnect(this._changedId);
            if (this._ownsInterface) this._interface.run_dispose();
            throw error;
        }
    }

    _load() {
        const saved = this._read(this._path);
        if (!saved) return {version: 1, keys: {}};
        const journal = JSON.parse(saved);
        if (journal.version !== 1 || !journal.keys || Array.isArray(journal.keys))
            throw new Error('Invalid LightOS font rendering journal');
        for (const [key, entry] of Object.entries(journal.keys)) {
            if (!(key in PRESET) || !entry || entry.last !== PRESET[key] ||
                (entry.original !== null && typeof entry.original !== 'string'))
                throw new Error('Invalid LightOS font rendering backup entry');
        }
        return journal;
    }

    _save(journal) {
        this._write(this._path, JSON.stringify(journal));
    }

    _userValue(key) {
        return this._interface.get_user_value(key)?.deep_unpack() ?? null;
    }

    _apply() {
        const journal = this._load();
        for (const [key, value] of Object.entries(PRESET)) {
            if (!this._interface.settings_schema.has_key(key) ||
                !this._interface.is_writable(key)) continue;
            // A surviving entry belongs to an earlier Shell session. Never
            // overwrite external changes made after that session wrote it.
            if (key in journal.keys) continue;
            journal.keys[key] = {original: this._userValue(key), last: value};
            // Persist before mutating dconf, including the default/user distinction.
            this._save(journal);
            if (!this._interface.set_string(key, value)) {
                delete journal.keys[key];
                this._save(journal);
            }
        }
    }

    _restore() {
        const journal = this._load();
        for (const [key, entry] of Object.entries(journal.keys)) {
            if (this._interface.settings_schema.has_key(key) &&
                this._userValue(key) === entry.last) {
                // Keep locked entries recoverable when policy becomes writable.
                if (!this._interface.is_writable(key)) continue;
                if (entry.original === null) this._interface.reset(key);
                else if (!this._interface.set_string(key, entry.original)) continue;
            }
            // An external user override (including reset-to-default) wins.
            delete journal.keys[key];
            this._save(journal);
        }
    }

    sync() {
        if (this._destroyed) return;
        const enabled = this._settings.get_boolean('font-smoothing-enabled');
        if (enabled && !this._active) {
            this._apply();
            this._active = true;
        } else if (!enabled) {
            this._restore();
            this._active = false;
        }
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._settings.disconnect(this._changedId);
        try {
            this._restore();
        } finally {
            this._active = false;
            if (this._ownsInterface) this._interface.run_dispose();
        }
    }
}
