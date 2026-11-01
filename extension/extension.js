import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';
import {AppColors, readPalette, readFile, writeFile, migratePalette} from './palette.js';
import {LightSearch} from './search.js';
import {AppThemes} from './appThemes.js';
import {NativeTray} from './tray.js';
import {WindowCentering} from './windowCentering.js';
import {SystemMenu} from './systemMenu.js';
import FontRendering from './fontRendering.js';
import FontProfile from './fontProfile.js';
import InteractionAnimations from './interactionAnimations.js';
import {SolarAppearance} from './solar/runtime.js';
import {ChromaLeon} from './chromaleon/runtime.js';
import {optionsFor, dynamicPalette, appCss, shellCss} from './chromaleon/engine.js';

export default class LightOS extends Extension {
    enable() {
        this._signals = [];
        this._settings = this.getSettings();
        migratePalette(this._settings);
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._appColors = new AppColors();
        this._appThemes = new AppThemes(this.dir);
        this._search = new LightSearch(this);
        this._centering = new WindowCentering(this._settings);
        this._fontRendering = new FontRendering(this._settings);
        this._fontProfile = new FontProfile(this._settings, this.dir);
        this._pressAnimations = new InteractionAnimations(this._settings);
        this._apps = Shell.AppSystem.get_default();
        this._savedInterfacePath = GLib.build_filenamev([
            GLib.get_user_state_dir(), 'lightos-gnome', 'interface-backup.json']);
        this._interfaceBackup = JSON.parse(readFile(this._savedInterfacePath) ?? '{}');
        this._chroma = new ChromaLeon(this);
        this._tray = new NativeTray();
        this._systemMenu = new SystemMenu(this);
        this._shortcutSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.keybindings'});
        this._shortcutBackupPath = GLib.build_filenamev([
            GLib.get_user_state_dir(), 'lightos-gnome', 'shortcut-backup.json']);
        this._shortcutBackup = JSON.parse(readFile(this._shortcutBackupPath) ?? '{}');
        this._removeShortcutConflicts();
        Main.wm.addKeybinding('search-shortcut', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, () => this._search.toggle());
        // Discover config folders created by the first start of optional apps.
        this._connect(this._apps, 'app-state-changed', () => {
            if (this._appRefresh) GLib.source_remove(this._appRefresh);
            this._appRefresh = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                this._appRefresh = 0;
                if (this._settings.get_boolean('color-apps')) {
                    const chroma = this._settings.get_string('color-engine') === 'chromaleon';
                    const palette = chroma ? dynamicPalette(this.dir, optionsFor(this._settings,this._interface)) :
                        readPalette(this.dir, this._settings.get_string('palette'));
                    const mode = this._interface.get_string('color-scheme') === 'prefer-dark' ? 'dark' : 'light';
                    this._appThemes._extra.apply(palette, mode, {flatpak: !chroma || this._settings.get_boolean('chroma-flatpak'),
                        gtk3: !chroma || this._settings.get_boolean('chroma-tint-gtk3')});
                }
                return GLib.SOURCE_REMOVE;
            });
        });
        this._connect(this._interface, 'changed::color-scheme', () => {
            const mode = this._interface.get_string('color-scheme') === 'prefer-dark' ? 'dark' : 'light';
            if (this._settings.get_string('appearance') !== 'system' && this._settings.get_string('appearance') !== mode)
                this._settings.set_string('appearance', mode);
            else this._applyColors(false);
        });
        this._connect(this._settings, 'changed', (_settings, key) => {
            if (key === 'palette') migratePalette(this._settings);
            if (['center-window', 'font-profile', 'font-smoothing-enabled', 'press-animations-enabled', 'maximize-new-workspace'].includes(key)) return;
            if (['chroma-colors','chroma-wallpaper','chroma-choices','chroma-error','auto-appearance','solar-status'].includes(key)) return;
            if (key === 'search-shortcut') this._removeShortcutConflicts();
            else {
                if (['color-engine','chroma-flatpak','chroma-tint-gtk3'].includes(key)) this._appThemes.restore();
                if (key === 'chroma-persistent') this._chroma.refreshWallpaper();
                this._applyColors(true);
            }
        });
        this._connect(this._interface,'changed::accent-color', () => {
            if (this._settings.get_string('color-engine') === 'chromaleon' &&
                this._settings.get_boolean('chroma-gnome-colors')) this._applyColors(false);
        });
        Main.layoutManager.uiGroup.add_style_class_name('lightos');
        this._applyColors(true);
        this._solar = new SolarAppearance(this._settings);
        this._connect(LoginManager.getLoginManager(), 'prepare-for-sleep', (_manager, preparing) => {
            if (!preparing) this._solar?.refresh();
        });
    }

    _connect(object, signal, callback) {
        this._signals.push([object, object.connect(signal, callback)]);
    }

    _removeShortcutConflicts() {
        const shortcut = this._settings.get_strv('search-shortcut');
        for (const key of ['switch-input-source', 'switch-input-source-backward']) {
            const current = this._shortcutSettings.get_strv(key);
            const saved = this._shortcutBackup[key];
            const original = saved && JSON.stringify(current) === JSON.stringify(saved.last) ?
                saved.original : current;
            const filtered = original.filter(binding => !shortcut.includes(binding));
            if (filtered.length === original.length) delete this._shortcutBackup[key];
            else this._shortcutBackup[key] = {original, last: filtered};
            writeFile(this._shortcutBackupPath, JSON.stringify(this._shortcutBackup));
            if (JSON.stringify(current) !== JSON.stringify(filtered))
                this._shortcutSettings.set_strv(key, filtered);
        }
    }

    _setInterface(key, value) {
        if (!this._interfaceBackup[key]) this._interfaceBackup[key] = {
            original: this._interface.get_string(key),
            default: this._interface.get_user_value(key) === null, last: value};
        this._interfaceBackup[key].last = value;
        writeFile(this._savedInterfacePath, JSON.stringify(this._interfaceBackup));
        if (this._interface.get_string(key) !== value) this._interface.set_string(key, value);
    }

    _restoreInterface(key) {
        const saved = this._interfaceBackup[key];
        if (!saved) return;
        if (this._interface.get_string(key) === saved.last) {
            if (saved.default) this._interface.reset(key);
            else this._interface.set_string(key,saved.original);
        }
        delete this._interfaceBackup[key];
        writeFile(this._savedInterfacePath,JSON.stringify(this._interfaceBackup));
    }

    _applyColors(setAppearance) {
        const chroma = this._settings.get_string('color-engine') === 'chromaleon';
        if (chroma && this._settings.get_boolean('chroma-gnome-colors')) this._restoreInterface('accent-color');
        const options = chroma ? optionsFor(this._settings,this._interface) : null;
        const palette = chroma ? dynamicPalette(this.dir,options) : readPalette(this.dir, this._settings.get_string('palette'));
        const appearance = this._settings.get_string('appearance');
        if (setAppearance && ['light', 'dark'].includes(appearance)) {
            this._setInterface('color-scheme', appearance === 'dark' ? 'prefer-dark' : 'prefer-light');
        } else if (setAppearance && appearance === 'system' && this._interfaceBackup['color-scheme']) {
            const {original, default: wasDefault} = this._interfaceBackup['color-scheme'];
            delete this._interfaceBackup['color-scheme'];
            writeFile(this._savedInterfacePath, JSON.stringify(this._interfaceBackup));
            if (wasDefault) this._interface.reset('color-scheme');
            else this._interface.set_string('color-scheme', original);
        }
        const mode = this._interface.get_string('color-scheme') === 'prefer-dark' ? 'dark' : 'light';
        const colors = palette.variants[mode];
        if (!chroma || !this._settings.get_boolean('chroma-gnome-colors')) this._setInterface('accent-color', palette.gnomeAccent);
        if (this._settings.get_boolean('color-apps')) {
            if (chroma) this._appColors.applyCss(appCss(this.dir,options,mode));
            else this._appColors.apply(colors);
            this._appThemes.apply(palette, mode, {flatpak:!chroma || this._settings.get_boolean('chroma-flatpak'),gtk3:!chroma || options.tintGtk3});
            if (chroma) this._chroma.hotReload();
        } else {
            this._appColors.restore();
            this._appThemes.restore();
        }

        // Match the native Shell appearance in every palette. Light mode has a
        // neutral white panel; palette accents remain on interactive controls.
        const c = colors;
        const p = mode === 'light' ? {...colors, canvas: '#ffffff', text: '#000000'} : colors;
        let css = `
            .lightos #panel { background-color: ${p.canvas}; color: ${p.text}; }
            .lightos #panel .panel-button { color: ${p.text}; }
            .lightos #panel .panel-button:hover, .lightos #panel .panel-button:active,
            .lightos #panel .panel-button:checked { background-color: ${p.secondary}; color: ${p.text}; }
            /* Keep native workspace dots legible against either panel background. */
            .lightos #panel .panel-button#panelActivities .workspace-dot
                { background-color: ${p.text}; }
            .lightos .popup-menu-content, .lightos .modal-dialog {
                background-color: ${c.surfaceRaised}; color: ${c.text}; }
            .lightos .popup-menu-item:active, .lightos .popup-menu-item:selected,
            .lightos .list-search-result:selected { background-color: ${c.secondary}; color: ${c.text}; }
            .lightos .quick-toggle:checked { background-color: ${c.accent}; color: ${c.accentForeground}; }
            .lightos .search-entry { background-color: ${c.canvas}; color: ${c.text}; }
            .lightos .search-entry:focus { border-color: ${c.messageAction}; }
            .lightos .search-section-content, .lightos .list-search-result { background-color: ${c.surfaceRaised}; color: ${c.text}; }
            .lightos .list-search-result:hover { background-color: ${c.secondary}; color: ${c.text}; }
            .lightos .list-search-result-description, .lightos .run-dialog-description { color: ${c.placeholder}; }
            .lightos .slider { -barlevel-active-background-color: ${c.accent}; }
        `;
        if (chroma) {
            try {css = shellCss(this.dir,options,mode) + '\n' + this._chroma.customCss(options.accent);}
            catch (error) {this._settings.set_string('chroma-error',error.message);}
        } else this._chroma.customCss('',false);
        this._chroma.extras(chroma ? options.accent : '#3584e4',chroma);
        // User-approved geometry exception, independent of both color engines.
        if (this._settings.get_boolean('panel-height-42'))
            css += '\n.lightos #panel { height: 42px; }';
        const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        const path = GLib.build_filenamev([GLib.get_user_cache_dir(), 'lightos-gnome', 'shell-colors.css']);
        const folder = Gio.File.new_for_path(GLib.path_get_dirname(path));
        for (const file of theme.get_custom_stylesheets()) {
            if (file.get_parent()?.equal(folder) && /^shell-colors(?:-[a-f0-9]{16})?\.css$/.test(file.get_basename()))
                theme.unload_stylesheet(file);
        }
        writeFile(path, css);
        // St caches parsed sheets by URI. Immutable names also survive native theme reloads.
        const digest = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256,css,-1).slice(0,16);
        const immutable = `${GLib.path_get_dirname(path)}/shell-colors-${digest}.css`;
        writeFile(immutable,css);
        this._themeFile = Gio.File.new_for_path(immutable);
        theme.load_stylesheet(this._themeFile);
    }

    disable() {
        this._systemMenu?.destroy(); this._systemMenu = null;
        this._pressAnimations?.destroy(); this._pressAnimations = null;
        this._fontRendering?.destroy(); this._fontRendering = null;
        this._fontProfile?.destroy(); this._fontProfile = null;
        this._centering?.destroy(); this._centering = null;
        this._solar?.destroy(); this._solar = null;
        if (this._appRefresh) GLib.source_remove(this._appRefresh);
        this._appRefresh = 0;
        for (const [object, id] of this._signals ?? []) object.disconnect(id);
        this._signals = [];
        this._chroma?.destroy(); this._chroma = null;
        Main.wm.removeKeybinding('search-shortcut');
        for (const [key, {original, last}] of Object.entries(this._shortcutBackup ?? {})) {
            if (JSON.stringify(this._shortcutSettings.get_strv(key)) === JSON.stringify(last))
                this._shortcutSettings.set_strv(key, original);
        }
        const shortcutBackup = Gio.File.new_for_path(this._shortcutBackupPath);
        if (shortcutBackup.query_exists(null)) shortcutBackup.delete(null);
        this._shortcutSettings = this._shortcutBackup = null;
        this._search?.destroy();
        this._search = null;
        this._tray?.destroy();
        this._tray = null;
        Main.layoutManager.uiGroup.remove_style_class_name('lightos');
        if (this._themeFile) St.ThemeContext.get_for_stage(global.stage).get_theme().unload_stylesheet(this._themeFile);
        this._themeFile = null;
        this._appColors?.restore();
        this._appThemes?.restore();
        for (const [key, {original, last, default: wasDefault}] of Object.entries(this._interfaceBackup ?? {})) {
            if (this._interface.get_string(key) !== last) continue;
            if (wasDefault) this._interface.reset(key);
            else this._interface.set_string(key, original);
        }
        const backup = Gio.File.new_for_path(this._savedInterfacePath);
        if (backup.query_exists(null)) backup.delete(null);
        this._interfaceBackup = null;
        this._settings = this._interface = this._appColors = this._apps = null;
        this._appThemes = null;
    }
}
