import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

// Preserve the usable monitor origin, including panels and negative coordinates.
// Oversized windows retain their top-left edge inside the usable work area.
export function centeredPosition(frame, area) {
    return {
        x: area.x + Math.max(0, Math.round((area.width - frame.width) / 2)),
        y: area.y + Math.max(0, Math.round((area.height - frame.height) / 2)),
    };
}

// Adapted from Findus' window centering (GPL-3.0).
export class WindowCentering {
    constructor(settings) {
        this._pending = null;
        this._animation = null;
        this._destroyed = false;
        Main.wm.addKeybinding('center-window', settings, Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL, () => this.center());
    }

    center(window = global.display.focus_window) {
        if (this._destroyed) return false;
        this._cancelPending();
        this._cancelAnimation();
        if (!window || !window.allows_move() || window.is_fullscreen()) return false;

        if (window.maximized_horizontally || window.maximized_vertically) {
            // Wayland's unmaximize request returns before the client has
            // acknowledged its restored size. Center the acknowledged frame.
            const pending = {window, sizeId: 0, unmanagedId: 0, timeout: 0};
            this._pending = pending;
            pending.sizeId = window.connect('size-changed', () => {
                if (window.maximized_horizontally || window.maximized_vertically) return;
                this._cancelPending();
                this._move(window);
            });
            pending.unmanagedId = window.connect('unmanaged', () => this._cancelPending());
            pending.timeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
                pending.timeout = 0;
                this._cancelPending();
                // Do not reposition a still-maximized, unresponsive client.
                if (!window.maximized_horizontally && !window.maximized_vertically)
                    this._move(window);
                return GLib.SOURCE_REMOVE;
            });
            window.unmaximize();
        } else {
            this._move(window);
        }
        return true;
    }

    _move(window) {
        if (!window.allows_move() || window.is_fullscreen()) return;
        const frame = window.get_frame_rect();
        const position = centeredPosition(frame, window.get_work_area_current_monitor());
        const actor = window.get_compositor_private();
        window.move_frame(true, position.x, position.y);
        if (!actor?.ease || !St.Settings.get().enable_animations ||
            (frame.x === position.x && frame.y === position.y)) return;

        const animation = {actor, x: actor.translation_x, y: actor.translation_y, destroyId: 0};
        this._animation = animation;
        animation.destroyId = actor.connect('destroy', () => this._cancelAnimation());
        actor.translation_x += frame.x - position.x;
        actor.translation_y += frame.y - position.y;
        actor.ease({
            translation_x: animation.x,
            translation_y: animation.y,
            duration: 280,
            mode: Clutter.AnimationMode.EASE_OUT_QUART,
            onStopped: () => {
                if (this._animation !== animation) return;
                this._animation = null;
                actor.disconnect(animation.destroyId);
                actor.translation_x = animation.x;
                actor.translation_y = animation.y;
            },
        });
    }

    _cancelPending() {
        const pending = this._pending;
        if (!pending) return;
        this._pending = null;
        pending.window.disconnect(pending.sizeId);
        pending.window.disconnect(pending.unmanagedId);
        if (pending.timeout) GLib.source_remove(pending.timeout);
    }

    _cancelAnimation() {
        const animation = this._animation;
        if (!animation) return;
        this._animation = null;
        const {actor} = animation;
        actor.disconnect(animation.destroyId);
        actor.remove_transition('translation-x');
        actor.remove_transition('translation-y');
        actor.translation_x = animation.x;
        actor.translation_y = animation.y;
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        Main.wm.removeKeybinding('center-window');
        this._cancelPending();
        this._cancelAnimation();
    }
}
