// SPDX-License-Identifier: GPL-3.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {readFile, writeFile} from '../palette.js';
import {calculatePaletteColors, chooseColor, validColor, colorOnly} from './engine.js';
import {applyAccentTheme} from './vendor/recolorUtils.js';

export class ChromaLeon {
    constructor(owner) {
        this.owner = owner;
        this.settings = owner._settings;
        this.background = new Gio.Settings({schema_id:'org.gnome.desktop.background'});
        this._generation = 0;
        this._iconsQueue = Promise.resolve();
        this._iconsGeneration = 0;
        owner._connect(this.background,'changed', () => this.refreshWallpaper());
        owner._connect(owner._interface,'changed::color-scheme', () => this.refreshWallpaper());
        this.refreshWallpaper();
    }
    async refreshWallpaper() {
        const generation = ++this._generation;
        this._cancellable?.cancel();
        this._cancellable = new Gio.Cancellable();
        const uri = this.background.get_string(this.owner._interface.get_string('color-scheme') === 'prefer-dark' ?
            'picture-uri-dark' : 'picture-uri');
        try {
            const colors = await calculatePaletteColors(uri,this._cancellable);
            if (!this.owner || generation !== this._generation) return;
            this.settings.set_string('chroma-wallpaper',uri);
            this.settings.set_strv('chroma-colors',colors);
            if (!colors.length) throw new Error('Das Hintergrundbild enthält keine auswertbaren Farben.');
            let choices; try {choices = JSON.parse(this.settings.get_string('chroma-choices'));} catch {choices = {};}
            const saved = this.settings.get_boolean('chroma-persistent') ? choices[uri] : null;
            // Extraction also runs while the T3 engine is selected, without selecting ChromaLeon.
            this.settings.set_string('chroma-accent', validColor(saved) ? saved : colors[0]);
            this.settings.set_string('chroma-error','');
        } catch (error) {
            if (generation === this._generation && this.owner && !this._cancellable.is_cancelled()) {
                this.settings.set_strv('chroma-colors',[]);
                this.settings.set_string('chroma-error',`Hintergrundbild: ${error.message}`);
            }
        }
    }
    customCss(accent, enabled = true) {
        const path = this.settings.get_string('chroma-custom-path');
        if (!enabled || !this.settings.get_boolean('chroma-custom-css') || !path) {
            this._monitor?.cancel(); this._monitor = null; this._monitorPath = null;
            return '';
        }
        if (this._monitorPath !== path) {
            this._monitor?.cancel();
            this._monitor = Gio.File.new_for_path(path).monitor_file(Gio.FileMonitorFlags.NONE,null);
            this._monitorPath = path;
            this._monitor.connect('changed', () => {
                if (!this.owner) return;
                if (this._customTimer) GLib.source_remove(this._customTimer);
                this._customTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT,200,() => {
                    this._customTimer = 0; this.owner?._applyColors(false); return GLib.SOURCE_REMOVE;
                });
            });
        }
        const css = readFile(path);
        if (css === null) throw new Error('Benutzerdefiniertes Stylesheet wurde nicht gefunden.');
        return colorOnly(css.replace(/@@ACCENT@@|-st-accent-color/g,accent));
    }
    extras(accent, enabled) {
        const shortcut = GLib.build_filenamev([GLib.get_user_data_dir(),'applications','dev.lightos.Appearance.desktop']);
        const shortcutText = '[Desktop Entry]\nType=Application\nName=LightOS Appearance\nExec=gnome-extensions prefs lightos@lightos.dev\nIcon=preferences-desktop-appearance-symbolic\nCategories=Settings;DesktopSettings;\n';
        const shortcutJournal = GLib.build_filenamev([GLib.get_user_state_dir(),'lightos-gnome','appearance-shortcut.json']);
        if (enabled && this.settings.get_boolean('chroma-create-shortcut')) {
            if (readFile(shortcutJournal) === null) writeFile(shortcutJournal,JSON.stringify({original:readFile(shortcut),last:shortcutText}));
            const saved=JSON.parse(readFile(shortcutJournal));
            if (readFile(shortcut) === saved.original || readFile(shortcut) === saved.last) writeFile(shortcut,shortcutText);
        } else if (readFile(shortcutJournal) !== null) {
            const saved=JSON.parse(readFile(shortcutJournal));
            if (readFile(shortcut) === saved.last) {
                if (saved.original === null) Gio.File.new_for_path(shortcut).delete(null);
                else writeFile(shortcut,saved.original);
            }
            Gio.File.new_for_path(shortcutJournal).delete(null);
        }
        const folders = enabled && this.settings.get_boolean('chroma-recolor-folders');
        const apps = enabled && this.settings.get_boolean('chroma-recolor-apps');
        const more = enabled && this.settings.get_boolean('chroma-morewaita');
        const iconKey = folders || apps ? `${accent}-${folders}-${apps}-${more}` : '';
        if (this._iconKey === iconKey) return;
        this._iconKey = iconKey;
        const generation = ++this._iconsGeneration;
        if (!iconKey) {this.owner._restoreInterface('icon-theme'); return;}
        this._iconsQueue = this._iconsQueue.catch(() => {}).then(async () => {
            if (!this.owner || generation !== this._iconsGeneration) return;
            const themeName = `LightOSChromaLeon-${accent.slice(1)}-${+folders}${+apps}${+more}`;
            const root = GLib.build_filenamev([GLib.get_user_data_dir(),'icons',themeName]);
            const journal = GLib.build_filenamev([GLib.get_user_state_dir(),'lightos-gnome','chroma-icons.json']);
            const owned = JSON.parse(readFile(journal) ?? '[]');
            if (Gio.File.new_for_path(root).query_exists(null) && !owned.includes(root))
                throw new Error('Ein vorhandener Icon-Ordner wird nicht überschrieben.');
            if (!owned.includes(root)) {owned.push(root); writeFile(journal,JSON.stringify(owned));}
            if (readFile(`${root}/index.theme`) === null)
                await applyAccentTheme(accent,{applyApps:apps,useMoreWaita:more,applyFolders:folders,themeName},this._iconCancellable=new Gio.Cancellable());
            if (this.owner && generation === this._iconsGeneration) this.owner._setInterface('icon-theme',themeName);
        }).catch(e => {if (this.owner) this.settings.set_string('chroma-error',`Icons: ${e.message}`);});
    }
    hotReload() {
        if (!this.settings.get_int('chroma-hot-reload')) return;
        if (this._reloadTimer) GLib.source_remove(this._reloadTimer);
        this._reloadTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT,300,() => {
            this._reloadTimer = 0;
            // ChromaLeon's standard reload signal: toggle high contrast and restore immediately.
            const accessibility = new Gio.Settings({schema_id:'org.gnome.desktop.a11y.interface'});
            const original = accessibility.get_user_value('high-contrast');
            const high = accessibility.get_boolean('high-contrast');
            accessibility.set_boolean('high-contrast',!high);
            if (original === null) accessibility.reset('high-contrast');
            else accessibility.set_value('high-contrast',original);
            return GLib.SOURCE_REMOVE;
        });
    }
    destroy() {
        this._cancellable?.cancel(); this._iconCancellable?.cancel();
        this._monitor?.cancel();
        ++this._generation; ++this._iconsGeneration;
        for (const timer of [this._reloadTimer,this._customTimer]) if (timer) GLib.source_remove(timer);
        this.extras('#3584e4',false);
        this.owner = null;
    }
}
