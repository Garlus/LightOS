import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

// A workspace belongs to this feature only while its window remains there.
// No global workspace preferences or application geometry are modified.
export class WorkspaceMaximize {
    constructor(settings) {
        this._settings = settings;
        this._windows = new Map();
        this._settingId = settings.connect('changed::maximize-new-workspace', () => this._refresh());
        this._refresh();
    }

    _refresh() {
        this._stop();
        if (!this._settings.get_boolean('maximize-new-workspace')) return;
        for (const actor of global.get_window_actors()) this._watch(actor.meta_window);
        this._created = global.display.connect('window-created', (_display, window) => this._watch(window));
    }

    _watch(window) {
        if (this._windows.has(window) || window.get_window_type() !== Meta.WindowType.NORMAL ||
            window.is_override_redirect()) return;
        const entry = {maximized: window.is_maximized(), signals: [], idle: 0, original: null, target: null};
        this._windows.set(window, entry);
        const schedule = () => {
            if (entry.idle) return;
            entry.idle = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                entry.idle = 0;
                const maximized = window.is_maximized();
                if (maximized !== entry.maximized) {
                    entry.maximized = maximized;
                    if (maximized) this._move(window, entry); else this._restore(window, entry);
                }
                return GLib.SOURCE_REMOVE;
            });
        };
        entry.signals.push(window.connect('notify::maximized-horizontally', schedule));
        entry.signals.push(window.connect('notify::maximized-vertically', schedule));
        entry.signals.push(window.connect('unmanaged', () => this._forget(window, entry)));
    }

    _move(window, entry) {
        if (!window.allows_move() || window.is_fullscreen() || window.is_on_all_workspaces() ||
            window.get_transient_for()) return;
        const manager = global.workspace_manager;
        entry.original = window.get_workspace();
        entry.originalIndex = entry.original.index();
        entry.target = manager.append_new_workspace(false, global.get_current_time());
        window.change_workspace(entry.target);
        if (window.has_focus()) entry.target.activate_with_focus(window, global.get_current_time());
    }

    _restore(window, entry) {
        if (!entry.original) return;
        const manager = global.workspace_manager;
        const workspaces = Array.from({length: manager.n_workspaces}, (_, i) => manager.get_workspace_by_index(i));
        if (window.get_workspace() === entry.target) {
            // GNOME may have removed an empty source workspace in dynamic mode.
            let original = entry.original;
            if (!workspaces.includes(original)) {
                original = manager.append_new_workspace(false, global.get_current_time());
                manager.reorder_workspace(original, Math.min(entry.originalIndex, manager.n_workspaces - 1));
            }
            const focused = window.has_focus();
            window.change_workspace(original);
            if (focused) original.activate_with_focus(window, global.get_current_time());
        }
        this._removeEmptyTarget(entry.target);
        entry.original = entry.target = null;
    }

    _removeEmptyTarget(target) {
        const manager = global.workspace_manager;
        if (target && manager.n_workspaces > 1 && target.index() >= 0 && target.list_windows().length === 0)
            manager.remove_workspace(target, global.get_current_time());
    }

    _forget(window, entry) {
        if (entry.idle) GLib.source_remove(entry.idle);
        entry.signals.forEach(id => window.disconnect(id));
        this._windows.delete(window);
        this._removeEmptyTarget(entry.target);
    }

    _stop() {
        if (this._created) global.display.disconnect(this._created);
        this._created = 0;
        for (const [window, entry] of [...this._windows]) {
            this._forget(window, entry);
            this._restore(window, entry);
        }
    }

    destroy() {
        this._settings.disconnect(this._settingId);
        this._stop();
    }
}
