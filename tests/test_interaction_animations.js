import Gio from 'gi://Gio';

// Execute the production controller with Shell/Clutter fixtures. No desktop
// settings are instantiated and no real actors or global event hooks are used.
const path = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent()
    .get_child('extension/interactionAnimations.js');
const [, contents] = path.load_contents(null);
const source = new TextDecoder().decode(contents)
    .replace(/^import .*;\n/gm, '')
    .replace('export default class InteractionAnimations', 'class InteractionAnimations');

let checks = 0;
function assert(condition, message) {
    checks++;
    if (!condition) throw new Error(message);
}

class Signals {
    constructor() { this.listeners = new Map(); this.next = 1; }
    connect(signal, callback) { const id = this.next++; this.listeners.set(id, {signal, callback}); return id; }
    disconnect(id) { this.listeners.delete(id); }
    emit(signal, argument) {
        for (const listener of [...this.listeners.values()])
            if (listener.signal === signal) listener.callback(this, argument);
    }
}

class Settings extends Signals {
    constructor(key) { super(); this.key = key; this.value = false; }
    get_boolean() { return this.value; }
    set(value) { this.value = value; this.emit(`changed::${this.key}`); }
    run_dispose() { this.disposed = true; }
}

class Actor extends Signals {
    constructor(parent = null) {
        super(); this.parent = parent; this.scale_x = .8; this.scale_y = 1.2;
        this.pivot = [.1, .3]; this.mapped = true; this.reactive = true;
        this.animations = []; this.transitions = 0;
    }

    get_parent() { return this.parent; }
    get_pivot_point() { return this.pivot; }
    set_pivot_point(x, y) { this.pivot = [x, y]; }
    set_scale(x, y) { this.scale_x = x; this.scale_y = y; }
    contains(child) {
        for (let actor = child; actor; actor = actor.parent) if (actor === this) return true;
        return false;
    }

    remove_transition() { this.transitions++; }
    ease(animation) {
        this.set_scale(animation.scale_x, animation.scale_y);
        this.animations.push(animation);
    }
}

const Clutter = {KEY_Return: 13, KEY_KP_Enter: 14, KEY_space: 32,
    EventType: {KEY_RELEASE: 1, KEY_PRESS: 2, BUTTON_PRESS: 3, TOUCH_BEGIN: 4},
    PickMode: {REACTIVE: 1}, AnimationMode: {EASE_OUT: 1, EASE: 2}, EVENT_PROPAGATE: false};
const options = new Settings('press-animations-enabled');
const desktop = new Settings('enable-animations');
desktop.value = true;
const stage = new Signals();
const panel = new Actor();
panel._leftBox = new Actor(panel);
panel._centerBox = new Actor(panel);
panel._rightBox = new Actor(panel);
const pill = new Actor(panel._rightBox);
pill.reactive = false; // Native panel items use a nonreactive St.Bin wrapper.
const label = new Actor(pill);
const grid = new Actor();
class QuickToggle extends Actor {}
class QuickMenuToggle extends Actor {}
const quickToggle = new QuickToggle(new Actor(grid));
panel.statusArea = {quickSettings: {menu: {_grid: grid}}};
stage.get_key_focus = () => stage.focus;
stage.get_actor_at_pos = () => stage.source;
stage.focus = label;
stage.source = label;
const Controller = new Function('Clutter', 'Gio', 'Main', 'QuickSettings', 'global',
    `${source}\nreturn InteractionAnimations;`)(Clutter,
    {Settings: class { constructor() { return desktop; } }}, {panel},
    {QuickToggle, QuickMenuToggle}, {stage});
const controller = new Controller(options);
assert(stage.listeners.size === 0, 'Default-off option installs no global capture');
options.set(true);
controller.sync();
assert(stage.listeners.size === 1, 'Activation and repeated sync install exactly one capture');
const event = (type, key = 13, button = 1) => ({type: () => type,
    get_key_symbol: () => key, get_key_code: () => key, get_button: () => button,
    get_coords: () => [0, 0]});
const dispatch = value => stage.emit('captured-event', value);
dispatch(event(Clutter.EventType.KEY_PRESS));
assert(pill.animations.length === 1, 'Keyboard activation resolves the nonreactive native panel wrapper');
dispatch(event(Clutter.EventType.KEY_PRESS));
assert(pill.animations.length === 1, 'Held activation key does not repeat feedback');
dispatch(event(Clutter.EventType.KEY_RELEASE));
dispatch(event(Clutter.EventType.KEY_PRESS));
assert(pill.animations.length === 2, 'Released key permits a new activation');
pill.animations[0].onComplete();
assert(pill.animations.length === 2, 'Superseded completion cannot start a stale release');
pill.animations[1].onComplete();
assert(pill.animations.length === 3, 'Current press starts release animation');
pill.animations[2].onStopped(true);
assert(pill.scale_x === .8 && pill.scale_y === 1.2 && pill.pivot[0] === .1 && pill.pivot[1] === .3,
    'Completion restores exact original transform and pivot');
assert(controller._actors.size === 0 && pill.listeners.size === 0,
    'Completed feedback releases actor records and destroy listeners');
dispatch(event(Clutter.EventType.BUTTON_PRESS, 13, 3));
assert(pill.animations.length === 3, 'Secondary mouse button is ignored');
dispatch(event(Clutter.EventType.BUTTON_PRESS));
desktop.set(false);
assert(stage.listeners.size === 0 && controller._actors.size === 0,
    'Global reduced-motion preference immediately stops capture and active animations');
assert(pill.scale_x === .8 && pill.scale_y === 1.2 && pill.pivot[0] === .1,
    'Global reduced-motion change restores an in-flight transform');
desktop.set(true);
stage.source = quickToggle;
dispatch(event(Clutter.EventType.TOUCH_BEGIN));
assert(quickToggle.animations.length === 1, 'Touch resolves a real QuickToggle through a nested group');
quickToggle.animations[0].onStopped(false);
assert(controller._actors.size === 0 && quickToggle.scale_x === .8,
    'Interrupted press restores actor without awaiting a subsequent interaction');
dispatch(event(Clutter.EventType.TOUCH_BEGIN));
quickToggle.emit('destroy');
assert(controller._actors.size === 0, 'Destroyed actor leaves no retained animation record');
options.set(false);
assert(stage.listeners.size === 0, 'Disabling the option removes the event capture');
controller.destroy();
controller.destroy();
assert(options.listeners.size === 0 && desktop.listeners.size === 0 && desktop.disposed,
    'Repeated destruction disconnects settings and disposes owned interface settings');
print(`${checks} interaction animation lifecycle checks passed (mock Shell, no host changes)`);
