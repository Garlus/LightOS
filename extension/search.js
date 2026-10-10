import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import * as RemoteSearch from 'resource:///org/gnome/shell/ui/remoteSearch.js';
import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as ParentalControls from 'resource:///org/gnome/shell/misc/parentalControlsManager.js';
import {calculate} from './calculator.js';

export function recentFiles() {
    try {
        const bookmarks = new GLib.BookmarkFile();
        bookmarks.load_from_file(GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']));
        return bookmarks.get_uris().filter(uri => uri.startsWith('file:'))
            .map(uri => ({uri, name: Gio.File.new_for_uri(uri).get_basename(),
                date: bookmarks.get_modified_date_time(uri).to_unix()}))
            .sort((a, b) => b.date - a.date).slice(0, 100);
    } catch {
        return [];
    }
}

export class LightSearch {
    constructor() {
        this._settings = new Gio.Settings({schema_id: 'org.gnome.desktop.search-providers'});
        this._parental = ParentalControls.getDefault();
        this._serial = 0;
        this._rows = [];
        this._dialog = new ModalDialog.ModalDialog({destroyOnClose: false,
            styleClass: 'lightos-search-dialog', actionMode: Shell.ActionMode.NORMAL});
        // This dialog has no action buttons; their empty row added 24px below the hint.
        this._dialog.buttonLayout.hide();
        this._dialog.contentLayout.set_style('max-width: 560px;');
        this._dialog.contentLayout.width = 560;
        this._dialog.contentLayout.add_style_class_name('message-dialog-content');
        this._dialog.contentLayout.add_child(new St.Label({text: 'Suche',
            style_class: 'message-dialog-title'}));
        this._entry = new St.Entry({style_class: 'search-entry', can_focus: true,
            hint_text: 'Apps, Dateien, Fenster oder Berechnungen', x_expand: true});
        this._entry.set_primary_icon(new St.Icon({icon_name: 'edit-find-symbolic',
            style_class: 'search-entry-icon', icon_size: 16}));
        this._dialog.contentLayout.add_child(this._entry);
        this._list = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'search-section-content', x_expand: true});
        this._dialog.contentLayout.add_child(this._list);
        this._status = new St.Label({text: '↑ ↓ Auswählen   ·   Enter Öffnen   ·   Esc Schließen',
            style_class: 'run-dialog-description'});
        this._dialog.contentLayout.add_child(this._status);
        this._dialog.setInitialKeyFocus(this._entry.clutter_text);
        this._entry.clutter_text.connect('text-changed', () => this._queueSearch());
        this._dialog.connect('captured-event', (_actor, event) => {
            if (event.type() !== Clutter.EventType.KEY_PRESS) return Clutter.EVENT_PROPAGATE;
            const key = event.get_key_symbol();
            if (key === Clutter.KEY_Escape) {
                this.close();
                return Clutter.EVENT_STOP;
            }
            if ([Clutter.KEY_Down, Clutter.KEY_Up, Clutter.KEY_Tab, Clutter.KEY_ISO_Left_Tab].includes(key)) {
                const backwards = key === Clutter.KEY_Up || key === Clutter.KEY_ISO_Left_Tab ||
                    (key === Clutter.KEY_Tab && Boolean(event.get_state() & Clutter.ModifierType.SHIFT_MASK));
                if (this._rows.length) this._select((this._selected + (backwards ? -1 : 1) +
                    this._rows.length) % this._rows.length);
                return Clutter.EVENT_STOP;
            }
            if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
                if (this._timeout) {
                    GLib.source_remove(this._timeout);
                    this._timeout = 0;
                    // Local results render synchronously before remote providers await.
                    this._runSearch();
                }
                this._rows[this._selected]?.activate();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this._dialog._eventBlocker.connect('button-press-event', () => {
            this.close();
            return Clutter.EVENT_STOP;
        });
        this._dialog.connect('closed', () => this._cancel());
    }

    toggle() {
        if (this._dialog.visible) {
            this.close();
            return;
        }
        Main.overview.hide();
        this._providers = RemoteSearch.loadRemoteSearchProviders(this._settings)
            .filter(p => this._parental.shouldShowApp(p.appInfo));
        this._entry.set_text('');
        const monitor = Main.layoutManager.currentMonitor;
        this._dialog.contentLayout.width = Math.min(560, monitor.width - 96);
        this._dialog.open();
        this._queueSearch();
    }

    close() {
        this._cancel();
        this._dialog.close();
    }

    _cancel() {
        this._serial++;
        this._cancellable?.cancel();
        if (this._timeout) GLib.source_remove(this._timeout);
        this._timeout = 0;
    }

    _queueSearch() {
        this._cancel();
        this._render([]);
        this._timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 120, () => {
            this._timeout = 0;
            this._runSearch();
            return GLib.SOURCE_REMOVE;
        });
    }

    _runSearch() {
        this._search().catch(error => {
            if (this._dialog) Main.notify('Suche', error.message);
            console.error(error);
        });
    }

    _select(index) {
        this._rows[this._selected]?.button.remove_style_pseudo_class('selected');
        this._selected = index;
        this._rows[index]?.button.add_style_pseudo_class('selected');
    }

    _render(results) {
        const selectedId = this._rows[this._selected]?.id;
        this._list.destroy_all_children();
        this._rows = results.slice(0, 7).map(result => {
            const button = new St.Button({style_class: 'list-search-result', can_focus: false,
                reactive: true, track_hover: true, x_expand: true,
                accessible_name: `${result.name}, ${result.description ?? ''}`});
            const box = new St.BoxLayout({style_class: 'list-search-result-content', x_expand: true});
            const icon = result.createIcon?.(24) ?? new St.Icon({
                icon_name: result.icon ?? 'application-x-executable-symbolic', icon_size: 24});
            box.add_child(icon);
            const labels = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
                x_expand: true, x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.CENTER});
            const title = new St.Label({text: result.name, style_class: 'list-search-result-title',
                x_align: Clutter.ActorAlign.START});
            title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            labels.add_child(title);
            if (result.description) {
                const description = new St.Label({text: result.description,
                    style_class: 'list-search-result-description', x_align: Clutter.ActorAlign.START});
                description.clutter_text.ellipsize = Pango.EllipsizeMode.END;
                labels.add_child(description);
            }
            box.add_child(labels);
            button.set_child(box);
            const activate = () => {
                this.close();
                try { result.activate(); } catch (error) { Main.notify('Suche', error.message); }
            };
            button.connect('clicked', activate);
            button.connect('notify::hover', () => {
                if (button.hover) this._select(this._rows.findIndex(row => row.button === button));
            });
            this._list.add_child(button);
            return {id: result.id, button, activate};
        });
        const selected = this._rows.findIndex(row => row.id === selectedId);
        this._select(selected >= 0 ? selected : 0);
        this._status.text = this._rows.length ? '↑ ↓ Auswählen   ·   Enter Öffnen   ·   Esc Schließen' :
            'Keine Treffer · Andere Suchbegriffe versuchen';
    }

    async _search() {
        const serial = this._serial;
        const query = this._entry.get_text().trim();
        const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
        const matches = text => terms.every(term => text.toLocaleLowerCase().includes(term));
        const system = Shell.AppSystem.get_default();
        const apps = query ? system.get_installed().filter(info =>
            this._parental.shouldShowApp(info) && matches(`${info.get_name()} ${info.get_id()} ` +
                `${info.get_description() ?? ''} ${info.get_keywords()?.join(' ') ?? ''}`))
            .map(info => system.lookup_app(info.get_id())).filter(Boolean) :
            [...new Set([...system.get_running(), ...AppFavorites.getAppFavorites().getFavorites()])];
        const results = [];
        const calc = calculate(query);
        if (calc !== null) results.push({id: 'calculation', name: `= ${calc}`,
            description: `${query} · Enter kopiert das Ergebnis`, icon: 'accessories-calculator-symbolic',
            activate: () => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, calc)});
        if (/^https?:\/\/\S+$/i.test(query)) results.push({id: 'url', name: query,
            description: 'Im Standardbrowser öffnen', icon: 'web-browser-symbolic',
            activate: () => Gio.AppInfo.launch_default_for_uri(query, global.create_app_launch_context(0, -1))});
        if (query) {
            for (const app of system.get_running()) {
                for (const window of app.get_windows()) {
                    if (!window.skip_taskbar && matches(`${window.get_title()} ${app.get_name()}`)) {
                        results.push({id: `window:${window.get_id()}`, name: window.get_title(),
                            description: `${app.get_name()} · Offenes Fenster`,
                            createIcon: size => app.create_icon_texture(size),
                            activate: () => Main.activateWindow(window)});
                    }
                }
            }
        }
        results.push(...apps.slice(0, 7).map(app => ({id: `app:${app.get_id()}`,
            name: app.get_name(), description: app.get_state() === Shell.AppState.RUNNING ? 'Laufende App' : 'App öffnen',
            createIcon: size => app.create_icon_texture(size), activate: () => app.activate()})));
        if (query) results.push(...recentFiles().filter(file => matches(file.name)).slice(0, 3).map(file => ({
            id: `recent:${file.uri}`, name: file.name, description: 'Zuletzt verwendete Datei',
            icon: 'document-open-recent-symbolic', activate: () => Gio.AppInfo.launch_default_for_uri(
                file.uri, global.create_app_launch_context(0, -1))})));
        this._render(results);
        if (!query || serial !== this._serial) return;
        this._cancellable = new Gio.Cancellable();
        const cancellable = this._cancellable;
        // Each provider runs independently; a slow provider cannot block local results.
        const remote = new Map();
        await Promise.allSettled((this._providers ?? []).map(async provider => {
            const ids = await provider.getInitialResultSet(query.split(/\s+/), cancellable);
            if (serial !== this._serial) return;
            const metas = await provider.getResultMetas(ids.slice(0, 3), cancellable);
            if (serial !== this._serial) return;
            remote.set(provider.id, metas.map(meta => ({...meta, id: `${provider.id}:${meta.id}`,
                description: `${provider.appInfo.get_name()} · ${meta.description ?? 'Suchergebnis'}`,
                activate: () => {
                    provider.activateResult(meta.id, query.split(/\s+/));
                    if (meta.clipboardText) St.Clipboard.get_default().set_text(
                        St.ClipboardType.CLIPBOARD, meta.clipboardText);
                }})));
            this._render([...results, ...this._providers.flatMap(p => remote.get(p.id) ?? [])]);
        }));
    }

    destroy() {
        this._cancel();
        this._dialog.destroy();
        this._dialog = null;
    }
}
