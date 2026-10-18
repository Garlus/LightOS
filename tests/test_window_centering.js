// Run with Node: the production controller executes against isolated Shell
// doubles; no desktop settings, windows or compositor are accessed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let nextId = 1;
const timers = new Map();
const bindings = new Map();
const shellSettings = {enable_animations: true};
const context = vm.createContext({
    Clutter: {AnimationMode: {EASE_OUT_QUART: 4}},
    GLib: {
        PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false,
        timeout_add(_priority, _delay, callback) {
            const id = nextId++; timers.set(id, callback); return id;
        },
        source_remove(id) { assert.ok(timers.delete(id), 'only live timers removed'); },
    },
    Meta: {KeyBindingFlags: {NONE: 0}, MaximizeFlags: {BOTH: 3}},
    Shell: {ActionMode: {NORMAL: 1}},
    St: {Settings: {get: () => shellSettings}},
    Main: {wm: {
        addKeybinding(name, _settings, _flags, _mode, callback) { bindings.set(name, callback); },
        removeKeybinding(name) { bindings.delete(name); },
    }},
    global: {display: {focus_window: null}},
});
const source = fs.readFileSync(path.join(__dirname, '../extension/windowCentering.js'), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export /gm, '');
vm.runInContext(`${source}\nglobalThis.Centering = WindowCentering; globalThis.position = centeredPosition;`, context);
const {Centering, position} = context;

class Signals {
    constructor() { this.signals = new Map(); }
    connect(name, callback) { const id = nextId++; this.signals.set(id, {name, callback}); return id; }
    disconnect(id) { assert.ok(this.signals.delete(id), 'only connected signals disconnected'); }
    emit(name) {
        for (const [id, signal] of [...this.signals])
            if (signal.name === name && this.signals.has(id)) signal.callback();
    }
}
function makeWindow({maximized = false, actor = false, movable = true, fullscreen = false} = {}) {
    const window = new Signals();
    Object.assign(window, {
        maximized_horizontally: maximized, maximized_vertically: maximized,
        frame: {x: 20, y: 40, width: 600, height: 400}, moves: [], unmaximized: 0,
        movable, fullscreen,
        allows_move() { return this.movable; }, is_fullscreen() { return this.fullscreen; },
        get_frame_rect() { return {...this.frame}; },
        get_work_area_current_monitor() { return {x: -1920, y: 32, width: 1920, height: 1048}; },
        get_compositor_private() { return this.actor; },
        move_frame(_user, x, y) { this.moves.push({x, y}); Object.assign(this.frame, {x, y}); },
        unmaximize(...args) { assert.equal(args.length, 0); this.unmaximized++; },
        restore() {
            this.maximized_horizontally = false; this.maximized_vertically = false;
            this.frame.width = 800; this.frame.height = 600; this.emit('size-changed');
        },
    });
    if (actor) {
        window.actor = new Signals();
        Object.assign(window.actor, {
            translation_x: 5, translation_y: 7, stopped: [],
            ease(options) { this.options = options; },
            remove_transition(name) { this.stopped.push(name); this.options?.onStopped(); },
        });
    }
    return window;
}
function coords(actual, expected) { assert.equal(JSON.stringify(actual), JSON.stringify(expected)); }
function timeout() {
    assert.equal(timers.size, 1);
    const [id, callback] = [...timers][0]; timers.delete(id); callback();
}

coords(position({width: 601, height: 401}, {x: -1920, y: 32, width: 1920, height: 1048}), {x: -1260, y: 356});
coords(position({width: 2000, height: 1200}, {x: 100, y: 32, width: 1920, height: 1048}), {x: 100, y: 32});
const controller = new Centering({});
assert.equal(bindings.size, 1);
assert.equal(controller.center(null), false);
for (const options of [{movable: false}, {fullscreen: true}]) {
    const window = makeWindow(options);
    assert.equal(controller.center(window), false); assert.equal(window.moves.length, 0);
}
const regular = makeWindow();
context.global.display.focus_window = regular;
bindings.get('center-window')();
coords(regular.moves, [{x: -1260, y: 356}]);

const restored = makeWindow({maximized: true});
controller.center(restored);
assert.equal(restored.unmaximized, 1); assert.equal(restored.moves.length, 0);
restored.emit('size-changed');
assert.equal(restored.moves.length, 0, 'still-maximized size notification is ignored');
restored.restore();
coords(restored.moves, [{x: -1360, y: 256}]);
assert.equal(timers.size, 0); assert.equal(restored.signals.size, 0);

const noResize = makeWindow({maximized: true});
controller.center(noResize);
noResize.maximized_horizontally = noResize.maximized_vertically = false;
timeout();
assert.equal(noResize.moves.length, 1, 'restored size without notification uses bounded fallback');
const unresponsive = makeWindow({maximized: true});
controller.center(unresponsive); timeout();
assert.equal(unresponsive.moves.length, 0, 'unresponsive maximized client is not moved');
assert.equal(unresponsive.signals.size, 0);

const closed = makeWindow({maximized: true});
controller.center(closed); closed.emit('unmanaged');
assert.equal(closed.signals.size, 0); assert.equal(timers.size, 0); assert.equal(closed.moves.length, 0);
const superseded = makeWindow({maximized: true});
controller.center(superseded); controller.center(makeWindow()); superseded.restore();
assert.equal(superseded.moves.length, 0, 'superseded Wayland request cannot move later');

shellSettings.enable_animations = false;
const reduced = makeWindow({actor: true}); controller.center(reduced);
assert.equal(reduced.actor.options, undefined); assert.equal(reduced.actor.translation_x, 5);
shellSettings.enable_animations = true;
const animated = makeWindow({actor: true}); controller.center(animated);
assert.notEqual(animated.actor.translation_x, 5);
animated.actor.options.onStopped();
assert.equal(animated.actor.translation_x, 5); assert.equal(animated.actor.translation_y, 7);
assert.equal(animated.actor.signals.size, 0);
const destroyedActor = makeWindow({actor: true}); controller.center(destroyedActor);
destroyedActor.actor.emit('destroy');
assert.equal(destroyedActor.actor.translation_x, 5); assert.equal(destroyedActor.actor.signals.size, 0);
const interrupted = makeWindow({actor: true}); controller.center(interrupted);
const pending = makeWindow({maximized: true}); controller.center(pending);
assert.equal(interrupted.actor.translation_x, 5); assert.equal(interrupted.actor.translation_y, 7);
assert.equal(interrupted.actor.signals.size, 0);
controller.destroy(); controller.destroy();
assert.equal(bindings.size, 0); assert.equal(timers.size, 0); assert.equal(pending.signals.size, 0);
assert.equal(controller.center(makeWindow()), false, 'destroyed controller cannot restart');
console.log('Window centering: geometry, shortcut, Wayland restore, fallback, lifecycle and reduced motion passed');
