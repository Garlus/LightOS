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
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as Screenshot from 'resource:///org/gnome/shell/ui/screenshot.js';
import {calculate} from './calculator.js';
import {PALETTES, LABELS} from './palette.js';
import {SearchStore} from './searchStore.js';
import {normalize, matchScore, rankResults, itemState, recordUse} from './searchModel.js';

export function recentFiles() {
    try {
        const bookmarks = new GLib.BookmarkFile();
        bookmarks.load_from_file(GLib.build_filenamev([GLib.get_user_data_dir(), 'recently-used.xbel']));
        return bookmarks.get_uris().filter(uri => uri.startsWith('file:'))
            .map(uri => ({uri, name: Gio.File.new_for_uri(uri).get_basename(),
                date: bookmarks.get_modified_date_time(uri).to_unix()}))
            .sort((a, b) => b.date - a.date).slice(0, 100)
            .filter(file => Gio.File.new_for_uri(file.uri).query_exists(null));
    } catch {
        return [];
    }
}

const HINT = 'Apps, Dateien, Fenster oder Befehle';
const HELP = '↑ ↓ Auswählen   ·   Enter Öffnen   ·   Strg K Aktionen';
const launchUri = uri => Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));

export class LightSearch {
    constructor(extension) {
        this._extension = extension;
        this._store = new SearchStore();
        this._settings = new Gio.Settings({schema_id: 'org.gnome.desktop.search-providers'});
        this._parental = ParentalControls.getDefault();
        this._serial = 0;
        this._rows = [];
        this._mode = 'search';
        this._dialog = new ModalDialog.ModalDialog({destroyOnClose: false,
            styleClass: 'lightos-search-dialog', actionMode: Shell.ActionMode.NORMAL});
        this._dialog.buttonLayout.hide();
        this._dialog.contentLayout.set_style('max-width: 560px;');
        this._dialog.contentLayout.width = 560;
        this._dialog.contentLayout.add_style_class_name('message-dialog-content');
        this._title = new St.Label({text: 'Suche', style_class: 'message-dialog-title'});
        this._dialog.contentLayout.add_child(this._title);
        this._entry = new St.Entry({style_class: 'search-entry', can_focus: true,
            hint_text: HINT, x_expand: true});
        this._entry.set_primary_icon(new St.Icon({icon_name: 'edit-find-symbolic',
            style_class: 'search-entry-icon', icon_size: 16}));
        this._dialog.contentLayout.add_child(this._entry);
        this._list = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
            style_class: 'search-section-content', x_expand: true});
        this._dialog.contentLayout.add_child(this._list);
        const footer = new St.BoxLayout({x_expand: true});
        this._status = new St.Label({text: HELP, style_class: 'run-dialog-description',
            x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        footer.add_child(this._status);
        this._actionsButton = new St.Button({label: 'Aktionen', style_class: 'button',
            can_focus: true, accessible_name: 'Aktionen für den ausgewählten Treffer'});
        this._actionsButton.connect('clicked', () => this._showActions());
        footer.add_child(this._actionsButton);
        this._dialog.contentLayout.add_child(footer);
        this._dialog.setInitialKeyFocus(this._entry.clutter_text);
        this._entry.clutter_text.connect('text-changed', () => this._queueSearch());
        this._dialog.connect('captured-event', (_actor, event) => this._key(event));
        this._dialog._eventBlocker.connect('button-press-event', () => {
            this.close();
            return Clutter.EVENT_STOP;
        });
        this._dialog.connect('closed', () => this._cancel());
    }

    _key(event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS) return Clutter.EVENT_PROPAGATE;
        const key = event.get_key_symbol();
        const ctrl = Boolean(event.get_state() & Clutter.ModifierType.CONTROL_MASK);
        const shift = Boolean(event.get_state() & Clutter.ModifierType.SHIFT_MASK);
        if (key === Clutter.KEY_Escape) {
            if (this._mode !== 'search' && !shift) this._back();
            else this.close();
        } else if (ctrl && (key === Clutter.KEY_k || key === Clutter.KEY_K)) {
            if (this._mode === 'search') this._showActions();
            else this._back();
        } else if (this._mode === 'alias') {
            if (key !== Clutter.KEY_Return && key !== Clutter.KEY_KP_Enter) return Clutter.EVENT_PROPAGATE;
            this._saveAlias();
        } else if (ctrl && key >= Clutter.KEY_1 && key <= Clutter.KEY_9) {
            this._flushSearch();
            this._rows[key - Clutter.KEY_1]?.activate(shift);
        } else if (ctrl && shift && (key === Clutter.KEY_f || key === Clutter.KEY_F)) {
            const result = this._rows[this._selected]?.result;
            if (this._mode === 'search' && result?.personalize) this._toggleFavorite(result);
        } else if (key === Clutter.KEY_Up && this._mode === 'search' &&
            !this._entry.get_text() && this._store.state.history.length) {
            this._entry.set_text(this._store.state.history[0]);
            this._entry.clutter_text.set_cursor_position(-1);
        } else if ([Clutter.KEY_Down, Clutter.KEY_Up, Clutter.KEY_Tab, Clutter.KEY_ISO_Left_Tab].includes(key) ||
            (ctrl && [Clutter.KEY_n, Clutter.KEY_p].includes(key))) {
            const backwards = [Clutter.KEY_Up, Clutter.KEY_ISO_Left_Tab, Clutter.KEY_p].includes(key) ||
                (key === Clutter.KEY_Tab && shift);
            if (this._rows.length) this._select((this._selected + (backwards ? -1 : 1) +
                this._rows.length) % this._rows.length);
        } else if (key === Clutter.KEY_Return || key === Clutter.KEY_KP_Enter) {
            this._flushSearch();
            this._rows[this._selected]?.activate(shift);
        } else return Clutter.EVENT_PROPAGATE;
        return Clutter.EVENT_STOP;
    }

    _flushSearch() {
        if (this._timeout && this._mode === 'search') {
            GLib.source_remove(this._timeout);
            this._timeout = 0;
            this._runSearch();
        }
    }

    toggle() {
        if (this._dialog.visible) {
            this.close();
            return;
        }
        Main.overview.hide();
        this._providers = RemoteSearch.loadRemoteSearchProviders(this._settings)
            .filter(p => this._parental.shouldShowApp(p.appInfo));
        this._mode = 'search';
        this._title.text = 'Suche';
        this._entry.hint_text = HINT;
        this._entry.clutter_text.editable = true;
        this._entry.set_text('');
        const monitor = Main.layoutManager.currentMonitor;
        this._dialog.contentLayout.width = Math.max(240, Math.min(560, monitor.width - 96));
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
        this._cancellable = null;
        if (this._timeout) GLib.source_remove(this._timeout);
        this._timeout = 0;
    }

    _queueSearch() {
        if (this._mode !== 'search') return;
        this._cancel();
        this._render([]);
        this._status.text = 'Suche …';
        this._timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 80, () => {
            this._timeout = 0;
            this._runSearch();
            return GLib.SOURCE_REMOVE;
        });
    }

    _runSearch() {
        this._search().catch(error => {
            if (this._dialog && this._dialog.visible) this._status.text = 'Suche fehlgeschlagen · Erneut versuchen';
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
        this._rows = results.slice(0, 7).map((result, index) => {
            const button = new St.Button({style_class: 'list-search-result', can_focus: false,
                reactive: true, track_hover: true, x_expand: true,
                accessible_name: `${result.name}, ${result.description ?? ''}`});
            const box = new St.BoxLayout({style_class: 'list-search-result-content', x_expand: true});
            box.add_child(result.createIcon?.(24) ?? new St.Icon({
                icon_name: result.icon ?? 'application-x-executable-symbolic', icon_size: 24}));
            const labels = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL,
                x_expand: true, x_align: Clutter.ActorAlign.START, y_align: Clutter.ActorAlign.CENTER});
            const title = new St.Label({text: `${result.favorite ? '★ ' : ''}${result.name}`,
                style_class: 'list-search-result-title', x_align: Clutter.ActorAlign.START});
            title.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            labels.add_child(title);
            if (result.description) {
                const description = new St.Label({text: result.description + (result.alias ? ` · Alias: ${result.alias}` : ''),
                    style_class: 'list-search-result-description', x_align: Clutter.ActorAlign.START});
                description.clutter_text.ellipsize = Pango.EllipsizeMode.END;
                labels.add_child(description);
            }
            box.add_child(labels);
            button.set_child(box);
            const activate = (newWindow = false) => {
                if (result.keepOpen) {
                    result.activate();
                    return;
                }
                const query = this._entry.get_text();
                this.close();
                try {
                    const pending = newWindow && result.newWindow ? result.newWindow() : result.activate();
                    Promise.resolve(pending).catch(error => Main.notify('Suche', error.message));
                    if (result.personalize) {
                        recordUse(this._store.state, result.id, query);
                        this._store.save();
                    }
                } catch (error) { Main.notify('Suche', error.message); }
            };
            button.connect('clicked', () => activate());
            button.connect('notify::hover', () => {
                if (button.hover) this._select(index);
            });
            this._list.add_child(button);
            return {id: result.id, result, button, activate};
        });
        const selected = this._rows.findIndex(row => row.id === selectedId);
        this._select(selected >= 0 ? selected : 0);
        this._actionsButton.visible = this._mode === 'search' && this._rows.length > 0;
        this._status.text = this._rows.length ? HELP : 'Keine Treffer · Andere Suchbegriffe versuchen';
    }

    _showActions() {
        this._flushSearch();
        const result = this._rows[this._selected]?.result;
        if (!result || this._mode !== 'search') return;
        this._cancel();
        this._rootQuery = this._entry.get_text();
        this._mode = 'actions';
        this._title.text = 'Aktionen';
        this._entry.clutter_text.editable = false;
        const actions = [{id: 'open', name: 'Öffnen', description: result.name,
            icon: 'go-next-symbolic', keepOpen: true, activate: () => {
                this._back();
                // Keep the selected result even when provider results change on return.
                const row = this._rows.find(row => row.id === result.id);
                if (row) row.activate();
                else { this.close(); result.activate(); }
            }}];
        if (result.newWindow) actions.push({id: 'new-window', name: 'Neues Fenster öffnen',
            description: 'Umschalt Enter', icon: 'window-new-symbolic', activate: result.newWindow});
        if (result.personalize) {
            const saved = itemState(this._store.state, result.id);
            actions.push({id: 'favorite', name: saved.favorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen',
                description: 'Strg Umschalt F', icon: 'starred-symbolic', keepOpen: true,
                activate: () => this._toggleFavorite(result)});
            actions.push({id: 'alias', name: 'Alias bearbeiten', description: saved.alias || 'Eigenes Suchkürzel festlegen',
                icon: 'document-edit-symbolic', keepOpen: true, activate: () => {
                    this._aliasResult = result;
                    this._mode = 'alias';
                    this._title.text = 'Alias bearbeiten';
                    this._entry.clutter_text.editable = true;
                    this._entry.hint_text = 'Suchkürzel eingeben';
                    this._entry.set_text(saved.alias);
                    this._entry.grab_key_focus();
                    this._render([]);
                    this._status.text = 'Enter Speichern · Leer entfernt den Alias · Esc Zurück';
                }});
            actions.push({id: 'hide', name: 'Treffer ausblenden', description: 'Mit „Ausgeblendete Treffer wieder anzeigen“ zurücksetzen',
                icon: 'view-conceal-symbolic', keepOpen: true, activate: () => {
                    saved.hidden = true;
                    this._store.save();
                    this._back();
                }});
        }
        this._render(actions);
        this._status.text = '↑ ↓ Auswählen   ·   Enter Ausführen   ·   Esc Zurück';
    }

    _toggleFavorite(result) {
        const saved = itemState(this._store.state, result.id);
        saved.favorite = !saved.favorite;
        this._store.save();
        if (this._mode !== 'search') this._back();
        else this._runSearch();
    }

    _saveAlias() {
        const alias = normalize(this._entry.get_text());
        if (alias.length > 40 || /\s/.test(alias)) {
            this._status.text = 'Ein Suchkürzel ohne Leerzeichen verwenden (max. 40 Zeichen)';
            return;
        }
        if (alias && Object.entries(this._store.state.items).some(([id, saved]) =>
            id !== this._aliasResult.id && saved.alias === alias)) {
            this._status.text = 'Dieses Suchkürzel ist bereits vergeben';
            return;
        }
        itemState(this._store.state, this._aliasResult.id).alias = alias;
        this._store.save();
        this._back();
    }

    _back() {
        this._mode = 'search';
        this._aliasResult = null;
        this._title.text = 'Suche';
        this._entry.hint_text = HINT;
        this._entry.clutter_text.editable = true;
        this._entry.set_text(this._rootQuery ?? '');
        this._entry.grab_key_focus();
        this._cancel();
        this._runSearch();
    }

    _commands() {
        const settings = this._extension._settings;
        const command = (id, name, description, icon, activate, keywords = '') =>
            ({id: `command:${id}`, name, description, icon, activate, keywords, personalize: true});
        return [
            command('preferences', 'LightOS-Einstellungen', 'LightOS › Einstellungen',
                'preferences-system-symbolic', () => this._extension.openPreferences(), 'settings preferences'),
            ...PALETTES.map((id, index) => command(`palette:${id}`, LABELS[index].split(' · ')[0],
                `Darstellung › Farbpalette${settings.get_string('palette') === id ? ' · Aktiv' : ''}`,
                'applications-graphics-symbolic', () => {
                    settings.set_string('color-engine', 't3');
                    settings.set_string('palette', id);
                }, 'theme thema palette farben')),
            ...['light', 'dark', 'system'].map((id, index) => command(`appearance:${id}`,
                ['Helle Darstellung', 'Dunkle Darstellung', 'Systemdarstellung'][index], 'Darstellung › Farbschema',
                'display-brightness-symbolic', () => settings.set_string('appearance', id), 'appearance hell dunkel dark light')),
            command('lock', 'Bildschirm sperren', 'GNOME › Sitzung', 'system-lock-screen-symbolic',
                () => SystemActions.getDefault().activateLockScreen(), 'lock screen'),
            command('screenshot', 'Bildschirmaufnahme', 'GNOME › Bildschirmfoto oder Video', 'camera-photo-symbolic',
                () => Screenshot.showScreenshotUI(), 'screenshot recording'),
            command('unhide', 'Ausgeblendete Treffer wieder anzeigen', 'Suche › Alle ausgeblendeten Apps und Befehle',
                'view-reveal-symbolic', () => {
                    for (const saved of Object.values(this._store.state.items)) saved.hidden = false;
                    this._store.save();
                }, 'restore hidden zurücksetzen'),
            command('clear-history', 'Suchverlauf zurücksetzen', 'Suche › Verlauf und gelernte Rangfolge löschen',
                'edit-clear-all-symbolic', () => {
                    this._store.state.history = [];
                    for (const saved of Object.values(this._store.state.items)) {
                        saved.count = 0; saved.last = 0; saved.terms = [];
                    }
                    this._store.save();
                }, 'history privacy datenschutz'),
        ].map(item => ['command:clear-history', 'command:unhide'].includes(item.id) ?
            {...item, personalize: false} : item);
    }

    async _search() {
        const serial = this._serial;
        const query = this._entry.get_text().trim().slice(0, 160);
        const system = Shell.AppSystem.get_default();
        const favorites = new Set(AppFavorites.getAppFavorites().getFavorites().map(app => app.get_id()));
        const candidates = system.get_installed().filter(info => this._parental.shouldShowApp(info))
            .map(info => ({info, app: system.lookup_app(info.get_id())})).filter(({app}) => app)
            .map(({info, app}) => ({id: `app:${app.get_id()}`, name: app.get_name(),
                description: app.get_state() === Shell.AppState.RUNNING ? 'Laufende App' : 'App öffnen',
                keywords: `${info.get_id()} ${info.get_description() ?? ''} ${info.get_keywords()?.join(' ') ?? ''}`,
                priority: query ? 0 : (favorites.has(app.get_id()) ? 12 : app.get_state() === Shell.AppState.RUNNING ? 8 : 0),
                personalize: true, createIcon: size => app.create_icon_texture(size),
                activate: () => app.activate(), newWindow: () => app.open_new_window(-1)}));
        const commands = this._commands();
        candidates.push(...commands.filter(item => query || this._store.state.items[item.id]?.favorite));
        if (query) {
            for (const app of system.get_running()) {
                const info = app.get_app_info();
                if (!info || !this._parental.shouldShowApp(info)) continue;
                for (const window of app.get_windows()) {
                    if (!window.skip_taskbar) candidates.push({id: `window:${window.get_id()}`,
                        name: window.get_title() || app.get_name(), description: `${app.get_name()} · Offenes Fenster`,
                        priority: 5, createIcon: size => app.create_icon_texture(size),
                        activate: () => Main.activateWindow(window)});
                }
            }
            candidates.push(...recentFiles().map(file => ({id: `recent:${file.uri}`, name: file.name,
                description: 'Zuletzt verwendete Datei', icon: 'document-open-recent-symbolic',
                activate: () => launchUri(file.uri)})));
        }
        const leading = [];
        const calc = calculate(query);
        if (calc !== null) leading.push({id: 'calculation', name: `= ${calc}`,
            description: `${query} · Enter kopiert das Ergebnis`, icon: 'accessories-calculator-symbolic',
            activate: () => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, calc)});
        if (/^https?:\/\/\S+$/i.test(query)) leading.push({id: 'url', name: query,
            description: 'Im Standardbrowser öffnen', icon: 'web-browser-symbolic', activate: () => launchUri(query)});
        const remote = new Map();
        const render = () => {
            if (serial !== this._serial || this._mode !== 'search') return;
            const ranked = rankResults(candidates, query, this._store.state);
            // Provider matches may refer to content rather than titles. Keep a relevance floor.
            const extras = (this._providers ?? []).flatMap(p => remote.get(p.id) ?? []);
            const combined = [...ranked, ...extras.map((item, index) => ({...item,
                score: Math.max(70, matchScore(query, item) ?? 0), order: ranked.length + index}))]
                .sort((a, b) => b.score - a.score || a.order - b.order);
            const results = [...leading, ...combined];
            if (query) results.push({id: 'web', name: `Im Web suchen: ${query}`,
                description: 'DuckDuckGo · Enter öffnet den Standardbrowser', icon: 'web-browser-symbolic',
                activate: () => launchUri(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`)});
            this._render(results);
        };
        render();
        if (!query || serial !== this._serial) return;
        this._cancellable = new Gio.Cancellable();
        const cancellable = this._cancellable;
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
            render();
        }));
    }

    destroy() {
        this._cancel();
        this._dialog.destroy();
        this._dialog = null;
        this._rows = [];
        this._providers = [];
        this._extension = null;
        this._store = null;
    }
}
