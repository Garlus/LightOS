import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

const PRESS_SCALE = .92;
const PRESS_TIME = 85;
const RELEASE_TIME = 220;
const ACTIVATE_KEYS = new Set([
    Clutter.KEY_Return, Clutter.KEY_KP_Enter, Clutter.KEY_space,
]);

// Derived from Findus' press feedback. Existing Shell actors retain their native
// dimensions and styling; temporary transforms are restored on every exit path.
export default class InteractionAnimations {
    constructor(settings) {
        this._settings = settings;
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._actors = new Map();
        this._pressedKeys = new Set();
        this._captureId = 0;
        this._destroyed = false;
        this._changedId = settings.connect('changed::press-animations-enabled', () => this.sync());
        this._animationsId = this._interface.connect('changed::enable-animations', () => this.sync());
        this.sync();
    }

    sync() {
        if (this._destroyed) return;
        const enabled = this._settings.get_boolean('press-animations-enabled') &&
            this._interface.get_boolean('enable-animations');
        if (enabled && !this._captureId) {
            this._captureId = global.stage.connect('captured-event',
                (_stage, event) => this._capture(event));
        } else if (!enabled) {
            this._stop();
        }
    }

    _target(source) {
        const panel = Main.panel;
        const boxes = [panel._leftBox, panel._centerBox, panel._rightBox];
        // Resolve the current grid on each event; another extension may replace it.
        const grid = panel.statusArea.quickSettings?.menu?._grid;
        for (let actor = source; actor; actor = actor.get_parent()) {
            // GNOME wraps PanelMenu.Button in a nonreactive St.Bin. Transform
            // that allocation, reached from its reactive button descendants.
            if (boxes.includes(actor.get_parent())) return actor;
            if (grid?.contains(actor) &&
                (actor instanceof QuickSettings.QuickToggle ||
                 actor instanceof QuickSettings.QuickMenuToggle)) return actor;
        }
        return null;
    }

    _capture(event) {
        const type = event.type();
        let source;
        if (type === Clutter.EventType.KEY_RELEASE) {
            this._pressedKeys.delete(event.get_key_code());
            return Clutter.EVENT_PROPAGATE;
        }
        if (type === Clutter.EventType.KEY_PRESS) {
            if (!ACTIVATE_KEYS.has(event.get_key_symbol())) return Clutter.EVENT_PROPAGATE;
            const code = event.get_key_code();
            if (this._pressedKeys.has(code)) return Clutter.EVENT_PROPAGATE;
            this._pressedKeys.add(code);
            source = global.stage.get_key_focus();
        } else if (type === Clutter.EventType.BUTTON_PRESS ||
            type === Clutter.EventType.TOUCH_BEGIN) {
            if (type === Clutter.EventType.BUTTON_PRESS && event.get_button() !== 1)
                return Clutter.EVENT_PROPAGATE;
            const [x, y] = event.get_coords();
            source = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
        const target = this._target(source);
        if (target?.mapped) this._twitch(target);
        return Clutter.EVENT_PROPAGATE;
    }

    _record(actor) {
        let record = this._actors.get(actor);
        if (record) return record;
        const [pivotX, pivotY] = actor.get_pivot_point();
        record = {scaleX: actor.scale_x, scaleY: actor.scale_y,
            pivotX, pivotY, generation: 0, destroyId: 0};
        record.destroyId = actor.connect('destroy', () => this._actors.delete(actor));
        this._actors.set(actor, record);
        return record;
    }

    _restore(actor, record) {
        if (this._actors.get(actor) !== record) return;
        ++record.generation;
        actor.remove_transition('scale-x');
        actor.remove_transition('scale-y');
        actor.set_scale(record.scaleX, record.scaleY);
        actor.set_pivot_point(record.pivotX, record.pivotY);
        actor.disconnect(record.destroyId);
        this._actors.delete(actor);
    }

    _twitch(actor) {
        const record = this._record(actor);
        const generation = ++record.generation;
        actor.remove_transition('scale-x');
        actor.remove_transition('scale-y');
        actor.set_pivot_point(.5, .5);
        actor.ease({
            scale_x: record.scaleX * PRESS_SCALE,
            scale_y: record.scaleY * PRESS_SCALE,
            duration: PRESS_TIME,
            mode: Clutter.AnimationMode.EASE_OUT,
            onStopped: finished => {
                if (!finished && generation === record.generation)
                    this._restore(actor, record);
            },
            onComplete: () => {
                if (this._actors.get(actor) !== record || generation !== record.generation) return;
                actor.ease({
                    scale_x: record.scaleX,
                    scale_y: record.scaleY,
                    duration: RELEASE_TIME,
                    mode: Clutter.AnimationMode.EASE,
                    onStopped: () => {
                        if (generation === record.generation) this._restore(actor, record);
                    },
                });
            },
        });
    }

    _stop() {
        if (this._captureId) global.stage.disconnect(this._captureId);
        this._captureId = 0;
        this._pressedKeys.clear();
        for (const [actor, record] of this._actors) this._restore(actor, record);
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._stop();
        this._settings.disconnect(this._changedId);
        this._interface.disconnect(this._animationsId);
        this._interface.run_dispose();
    }
}
