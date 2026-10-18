import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as Screenshot from 'resource:///org/gnome/shell/ui/screenshot.js';
import {AppColors, PALETTES, LABELS, readPalette, readFile, writeFile} from './palette.js';
import {LightSearch, recentFiles} from './search.js';
import {AppThemes} from './appThemes.js';
import {NativeTray} from './tray.js';
import {AirDrop} from './airdrop.js';
import {DesktopOrb} from './orb.js';
import {WindowCentering} from './windowCentering.js';
import FontRendering from './fontRendering.js';
import InteractionAnimations from './interactionAnimations.js';
import {SolarAppearance} from './solar/runtime.js';
import {ChromaLeon} from './chromaleon/runtime.js';
import {optionsFor, dynamicPalette, appCss, shellCss} from './chromaleon/engine.js';

export default class LightOS extends Extension {
    enable() {
        this._signals = [];
        this._settings = this.getSettings();
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._appColors = new AppColors();
        this._appThemes = new AppThemes(this.dir);
        this._search = new LightSearch();
        this._actions = SystemActions.getDefault();
        this._centering = new WindowCentering(this._settings);
        this._fontRendering = new FontRendering(this._settings);
        this._pressAnimations = new InteractionAnimations(this._settings);
        this._tracker = Shell.WindowTracker.get_default();
        this._apps = Shell.AppSystem.get_default();
        this._savedInterfacePath = GLib.build_filenamev([
            GLib.get_user_state_dir(), 'lightos-gnome', 'interface-backup.json']);
        this._interfaceBackup = JSON.parse(readFile(this._savedInterfacePath) ?? '{}');
        this._chroma = new ChromaLeon(this);
        this._system = new PanelMenu.Button(0, 'LightOS Systemmenü');
        this._orb = new DesktopOrb(this._system);
        this._system.menu.box.add_style_class_name('lightos-orb-menu');
        this._system.menu.setSourceAlignment(0);
        Main.panel.addToStatusArea('lightos-system', this._system, 0, 'left');
        this._system.menu.connect('open-state-changed', (_menu, open) => {
            if (open) {
                this._buildSystemMenu();
                this._actions.forceUpdate();
            }
        });

        this._activeApp = new PanelMenu.Button(0, 'Aktive Anwendung');
        this._activeLabel = new St.Label({text: 'Desktop', y_align: Clutter.ActorAlign.CENTER});
        this._activeLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        this._activeLabel.set_style('max-width: 220px;');
        this._activeApp.add_child(this._activeLabel);
        Main.panel.addToStatusArea('lightos-active-app', this._activeApp, 1, 'left');
        this._activeApp.menu.connect('open-state-changed', (_menu, open) => {
            if (open) this._buildActiveMenu();
        });
        this._activities = Main.panel.statusArea.activities;
        this._activitiesVisible = this._activities.visible;
        this._activities.hide();

        this._tray = new NativeTray();
        this._airdrop = new AirDrop(this.dir);
        this._shortcutSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.wm.keybindings'});
        this._shortcutBackupPath = GLib.build_filenamev([
            GLib.get_user_state_dir(), 'lightos-gnome', 'shortcut-backup.json']);
        this._shortcutBackup = JSON.parse(readFile(this._shortcutBackupPath) ?? '{}');
        this._removeShortcutConflicts();
        Main.wm.addKeybinding('search-shortcut', this._settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW, () => this._search.toggle());
        this._connect(global.display, 'notify::focus-window', () => this._syncActive());
        this._connect(this._actions, 'notify', () => this._syncSystemActions());
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
            if (['center-window', 'font-smoothing-enabled', 'press-animations-enabled'].includes(key)) return;
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
        this._syncActive();
        // Empty PopupMenu instances refuse to open; populate before the first click.
        this._buildSystemMenu();
        this._buildActiveMenu();
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

    _launch(id, args = []) {
        if (args.length) {
            new Gio.Subprocess({argv: args, flags: Gio.SubprocessFlags.NONE}).init(null);
        } else {
            const app = this._apps.lookup_app(id);
            if (app) app.activate();
            else Main.notify('LightOS', 'Diese Anwendung ist nicht installiert.');
        }
    }

    _menuAction(menu, label, callback, icon = null) {
        const item = icon ? new PopupMenu.PopupImageMenuItem(label, icon) :
            new PopupMenu.PopupMenuItem(label);
        item.connect('activate', callback);
        menu.addMenuItem(item);
        return item;
    }

    _buildSystemMenu() {
        const menu = this._system.menu;
        menu.removeAll();
        const header = new PopupMenu.PopupMenuItem('LightOS · GNOME', {reactive: false});
        menu.addMenuItem(header);
        this._menuAction(menu, 'Übersicht', () => Main.overview.toggle(), 'view-grid-symbolic');
        this._menuAction(menu, 'Suchen', () => this._search.toggle(), 'edit-find-symbolic');
        this._menuAction(menu, 'Bildschirmfoto …', () => {
            // The screenshot UI owns its modal grab; release the menu first.
            menu.close();
            Screenshot.showScreenshotUI();
        }, 'camera-photo-symbolic');
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._menuAction(menu, 'Einstellungen', () => this._launch('org.gnome.Settings.desktop'), 'preferences-system-symbolic');
        this._menuAction(menu, 'Software', () => this._launch('org.gnome.Software.desktop'), 'org.gnome.Software-symbolic');
        const recent = new PopupMenu.PopupSubMenuMenuItem('Zuletzt verwendete Dateien');
        menu.addMenuItem(recent);
        const files = recentFiles().slice(0, 5);
        for (const file of files) this._menuAction(recent.menu, file.name,
            () => Gio.AppInfo.launch_default_for_uri(file.uri, global.create_app_launch_context(0, -1)));
        if (!files.length) recent.menu.addMenuItem(new PopupMenu.PopupMenuItem('Noch keine Dateien', {reactive: false}));
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const themes = new PopupMenu.PopupSubMenuMenuItem('Farbpalette');
        menu.addMenuItem(themes);
        PALETTES.forEach((id, index) => {
            const item = this._menuAction(themes.menu, LABELS[index], () => {
                this._settings.set_string('palette', id); this._settings.set_string('color-engine','t3');
            });
            item.setOrnament(this._settings.get_string('color-engine') === 't3' && id === this._settings.get_string('palette') ?
                PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE);
        });
        this._menuAction(menu, 'LightOS anpassen', () => this.openPreferences(), 'preferences-other-symbolic');
        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._systemActions = [
            ['Sperren', 'canLockScreen', 'activateLockScreen', 'system-lock-screen-symbolic'],
            ['Bereitschaft', 'canSuspend', 'activateSuspend', 'media-playback-pause-symbolic'],
            ['Benutzer wechseln …', 'canSwitchUser', 'activateSwitchUser', 'system-switch-user-symbolic'],
            ['Abmelden …', 'canLogout', 'activateLogout', 'system-log-out-symbolic'],
            ['Neustart …', 'canRestart', 'activateRestart', 'system-reboot-symbolic'],
            ['Ausschalten …', 'canPowerOff', 'activatePowerOff', 'system-shutdown-symbolic'],
        ].map(([label, capability, method, icon]) => ({
            capability,
            item: this._menuAction(menu, label, () => {
                if (this._actions[capability]) this._actions[method]();
            }, icon),
        }));
        this._syncSystemActions();
    }

    _syncSystemActions() {
        for (const {item, capability} of this._systemActions ?? [])
            item.setSensitive(this._actions[capability]);
    }

    _syncActive() {
        const window = global.display.focus_window;
        const app = window ? this._tracker.get_window_app(window) : null;
        this._focusedWindow = window;
        this._focusedApp = app;
        this._activeLabel.text = app?.get_name() ?? 'Desktop';
        this._activeApp.accessible_name = this._activeLabel.text;

    }

    _buildActiveMenu() {
        this._activeApp.menu.removeAll();
        const app = this._focusedApp;
        if (app) {
            for (const window of app.get_windows().filter(w => !w.skip_taskbar))
                this._menuAction(this._activeApp.menu, window.get_title(), () => Main.activateWindow(window));
            this._activeApp.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            const window = this._focusedWindow;
            const center = this._menuAction(this._activeApp.menu, 'Fenster zentrieren', () => this._centering.center(window));
            center.setSensitive(!!window && window.allows_move() && !window.is_fullscreen());
            this._menuAction(this._activeApp.menu, 'Fenster schließen', () => window?.delete(global.get_current_time()));
        }
        this._menuAction(this._activeApp.menu, 'Alle Fenster anzeigen', () => Main.overview.show());
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

        // GNOME 50 keeps the panel dark and follows appearance for native menus.
        const c = colors;
        const p = palette.variants.dark;
        let css = `
            .lightos #panel { background-color: ${p.canvas}; color: ${p.text}; }
            .lightos #panel .panel-button { color: ${p.text}; }
            .lightos #panel .panel-button:hover, .lightos #panel .panel-button:active,
            .lightos #panel .panel-button:checked { background-color: ${p.secondary}; color: ${p.text}; }
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
        // Match native Quick Settings content padding in the current theme.
        const quickPadding = Main.panel.statusArea.quickSettings.menu.box.get_theme_node();
        const sides = [St.Side.TOP, St.Side.RIGHT, St.Side.BOTTOM, St.Side.LEFT];
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const padding = sides.map(side => quickPadding.get_padding(side) / scale);
        css += `\n.lightos-orb-menu { padding: ${padding.map(value => `${value}px`).join(' ')}; }`;
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
        this._pressAnimations?.destroy(); this._pressAnimations = null;
        this._fontRendering?.destroy(); this._fontRendering = null;
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
        this._orb?.destroy(); this._orb = null;
        this._system?.destroy();
        this._systemActions = null;
        this._activeApp?.destroy();
        this._tray?.destroy();
        this._tray = null;
        this._airdrop?.destroy();
        this._airdrop = null;
        if (this._activitiesVisible) this._activities?.show();
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
        this._settings = this._interface = this._appColors = this._actions = this._tracker = this._apps = null;
        this._appThemes = null;
        this._system = this._activeApp = this._activeLabel = null;
        this._focusedWindow = this._focusedApp = this._activities = null;
    }
}
