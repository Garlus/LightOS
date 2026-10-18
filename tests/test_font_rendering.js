import FontRendering from '../extension/fontRendering.js';

let checks = 0;
function assert(condition, message) {
    checks++;
    if (!condition) throw new Error(message);
}

class MockSettings {
    constructor(values = {}) {
        this.values = {...values};
        this.listeners = new Map();
        this.nextId = 1;
        this.writes = [];
        this.locked = new Set();
        this.keys = new Set(['font-rendering', 'font-antialiasing', 'font-hinting']);
        this.settings_schema = {has_key: key => this.keys.has(key)};
    }

    connect(signal, callback) {
        const id = this.nextId++;
        this.listeners.set(id, {signal, callback});
        return id;
    }

    disconnect(id) { this.listeners.delete(id); }
    get_boolean(key) { return this.values[key] ?? false; }
    get_user_value(key) {
        const value = this.values[key];
        return value === undefined ? null : {deep_unpack: () => value};
    }

    is_writable(key) { return !this.locked.has(key); }
    reset(key) { delete this.values[key]; this.writes.push([key, null]); }
    set_string(key, value) {
        if (!this.is_writable(key)) return false;
        this.values[key] = value;
        this.writes.push([key, value]);
        return true;
    }

    toggle(value) {
        this.values['font-smoothing-enabled'] = value;
        for (const {signal, callback} of this.listeners.values())
            if (signal === 'changed::font-smoothing-enabled') callback();
    }
}

function fixture(original = {}, enabled = false) {
    const option = new MockSettings({'font-smoothing-enabled': enabled});
    const desktop = new MockSettings(original);
    let saved = null;
    const options = {interfaceSettings: desktop, statePath: 'memory',
        read: () => saved, write: (_path, value) => { saved = value; }};
    const controller = new FontRendering(option, options);
    return {option, desktop, controller, options, journal: () => JSON.parse(saved)};
}

const defaults = fixture();
assert(defaults.desktop.writes.length === 0, 'Disabled default does not mutate desktop settings');
defaults.option.toggle(true);
assert(defaults.desktop.values['font-rendering'] === 'manual', 'Preset activates through settings signal');
assert(defaults.journal().keys['font-rendering'].original === null, 'Journal retains default-value provenance');
assert(defaults.journal().keys['font-hinting'].last === 'none', 'Journal records last written value');
defaults.controller.sync();
assert(defaults.desktop.writes.length === 3, 'Repeated sync does not rewrite active settings');
defaults.option.toggle(false);
assert(Object.keys(defaults.desktop.values).length === 0, 'Restore resets originally default-valued keys');
assert(Object.keys(defaults.journal().keys).length === 0, 'Restoration retires journal entries');
defaults.controller.destroy();
defaults.controller.destroy();
assert(defaults.option.listeners.size === 0, 'Repeated destruction disconnects safely');

const external = fixture({'font-antialiasing': 'rgba', 'font-hinting': 'full'}, true);
external.desktop.values['font-antialiasing'] = 'none';
delete external.desktop.values['font-rendering'];
external.controller.destroy();
assert(external.desktop.values['font-antialiasing'] === 'none', 'External override survives shutdown');
assert(!('font-rendering' in external.desktop.values), 'External reset to default survives shutdown');
assert(external.desktop.values['font-hinting'] === 'full', 'Original explicit override restores exactly');

const crashed = fixture({'font-hinting': 'slight'}, true);
// A replacement controller reads the surviving journal after a simulated Shell
// crash. The previous instance is abandoned without calling its cleanup path.
crashed.desktop.values['font-antialiasing'] = 'rgba';
const resumed = new FontRendering(crashed.option, crashed.options);
assert(crashed.desktop.values['font-antialiasing'] === 'rgba', 'Session recovery preserves external changes');
resumed.destroy();
assert(crashed.desktop.values['font-hinting'] === 'slight', 'Session recovery retains the first original override');
assert(crashed.desktop.values['font-antialiasing'] === 'rgba', 'Recovery shutdown keeps external override');
crashed.controller.destroy();

const locked = fixture({'font-hinting': 'full'}, true);
locked.desktop.locked.add('font-hinting');
locked.option.toggle(false);
assert('font-hinting' in locked.journal().keys, 'Locked restoration remains journalled for a later recovery');
locked.desktop.locked.clear();
locked.controller.sync();
assert(locked.desktop.values['font-hinting'] === 'full', 'Unlock permits deferred restoration');
locked.controller.destroy();

const oldSchema = fixture();
oldSchema.desktop.keys.delete('font-rendering');
oldSchema.option.toggle(true);
assert(!('font-rendering' in oldSchema.journal().keys), 'Missing schema keys are skipped');
oldSchema.controller.destroy();

const option = new MockSettings({'font-smoothing-enabled': true});
const desktop = new MockSettings();
let refused = false;
try {
    new FontRendering(option, {interfaceSettings: desktop,
        read: () => null, write: () => { throw new Error('Read-only state directory'); }});
} catch (_error) { refused = true; }
assert(refused && desktop.writes.length === 0, 'Journal failure prevents unjournalled desktop changes');
assert(option.listeners.size === 0, 'Failed construction disconnects option listener');
print(`${checks} font rendering lifecycle checks passed (mock settings, no host changes)`);
