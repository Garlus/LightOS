import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import FontProfile from '../extension/fontProfile.js';
import FontAssets from '../extension/fontAssets.js';

let checks = 0;
function assert(condition, message) {
    checks++;
    if (!condition) throw new Error(message);
}
const defaults = {'font-name': 'Adwaita Sans 11', 'document-font-name': 'Adwaita Sans 12',
    'monospace-font-name': 'Adwaita Mono 11'};
class Settings {
    constructor(values = {}) {
        this.values = {...values};
        this.listeners = new Map();
        this.locked = new Set();
        this.settings_schema = {has_key: key => key in defaults};
    }
    connect(signal, callback) { const id = this.listeners.size + 1; this.listeners.set(id, callback); return id; }
    disconnect(id) { this.listeners.delete(id); }
    get_string(key) { return this.values[key] ?? defaults[key]; }
    get_user_value(key) { return key in this.values ? new GLib.Variant('s', this.values[key]) : null; }
    is_writable(key) { return !this.locked.has(key); }
    reset(key) { delete this.values[key]; }
    set_string(key, value) {
        if (!this.is_writable(key)) return false;
        this.values[key] = value;
        for (const callback of this.listeners.values()) callback();
        return true;
    }
}
function fixture(original = {}, profile = 'geist') {
    const settings = new Settings({'font-profile': profile});
    const desktop = new Settings(original);
    let saved = null, installed = false;
    const options = {interfaceSettings: desktop, read: () => saved,
        write: (_path, value) => { saved = value; },
        fonts: {ensure: () => { installed = true; }, destroy: () => { installed = false; }}};
    const controller = new FontProfile(settings, null, options);
    return {settings, desktop, options, controller, journal: () => JSON.parse(saved), installed: () => installed};
}
const f = fixture({'font-name': 'Cantarell Semi-Bold Italic 13.5', 'monospace-font-name': 'Monospace 14'});
assert(f.desktop.get_string('font-name') === 'Geist Semi-Bold Italic 13.5', 'Preserves weight, slant and fractional size');
assert(f.desktop.get_string('document-font-name') === 'Geist 12', 'Document font preserves default size');
assert(f.desktop.get_string('monospace-font-name') === 'Geist Mono 14', 'Mono family preserves custom size');
assert(f.journal().keys['document-font-name'].original === null, 'Records unset default provenance');
f.settings.set_string('font-profile', 'adwaita');
assert(f.desktop.get_string('font-name') === 'Adwaita Sans Semi-Bold Italic 13.5', 'Switches to native Adwaita sans');
assert(f.desktop.get_string('monospace-font-name') === 'Adwaita Mono 14', 'Switches mono with sans');
f.settings.set_string('font-profile', 'geist');
f.controller.destroy(); f.controller.destroy();
assert(f.desktop.get_string('font-name') === 'Cantarell Semi-Bold Italic 13.5', 'Restores original across repeated profile switches');
assert(!('document-font-name' in f.desktop.values), 'Restores original unset value');
assert(!f.installed() && !f.settings.listeners.size, 'Cleans assets and listener on disable');

const external = fixture();
external.desktop.set_string('font-name', 'Serif 16');
external.controller.sync();
assert(external.desktop.get_string('font-name') === 'Serif 16', 'Repeated sync respects external override');
external.settings.set_string('font-profile', 'adwaita');
assert(external.desktop.get_string('font-name') === 'Adwaita Sans 16', 'Explicit choice preserves externally changed size');
external.controller.destroy();
assert(external.desktop.get_string('font-name') === 'Serif 16', 'External override becomes new restoration baseline');

const customGeist = fixture();
customGeist.desktop.set_string('font-name', 'Geist 17');
customGeist.controller.destroy();
assert(customGeist.desktop.get_string('font-name') === 'Geist 17' && customGeist.installed(),
    'Preserves font assets required by an external Geist override');

const crash = fixture({'font-name': 'Sans 15'});
crash.desktop.reset('document-font-name');
const recovered = new FontProfile(crash.settings, null, crash.options);
assert(!('document-font-name' in crash.desktop.values), 'Crash recovery respects external reset');
recovered.destroy();
assert(crash.desktop.get_string('font-name') === 'Sans 15', 'Crash recovery retains first original value');
crash.controller.destroy();

const locked = fixture();
locked.desktop.locked.add('font-name');
locked.controller.destroy();
assert('font-name' in locked.journal().keys && locked.installed(), 'Locked values retain journal and required font assets');
locked.desktop.locked.clear();
const unlocked = new FontProfile(locked.settings, null, locked.options);
unlocked.destroy();
assert(!('font-name' in locked.desktop.values), 'Deferred restoration succeeds after unlock');

const settings = new Settings({'font-profile': 'geist'});
const desktop = new Settings();
let failed = false;
try {
    new FontProfile(settings, null, {interfaceSettings: desktop, fonts: {ensure() {}, destroy() {}},
        read: () => null, write: () => { throw new Error('Read-only state'); }});
} catch { failed = true; }
assert(failed && Object.keys(desktop.values).length === 0 && settings.listeners.size === 0,
    'Journal write failure prevents unjournalled desktop mutations and disconnects');

// The VM test runner provides isolated XDG paths. Exercise actual Fontconfig
// discovery and symlink ownership without touching the VM desktop profile.
const extensionDir = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('extension');
const assets = new FontAssets(extensionDir);
assets.ensure(); assets.ensure();
const command = Gio.Subprocess.new(['fc-match', '-f', '%{family}', 'Geist Mono'], Gio.SubprocessFlags.STDOUT_PIPE);
const [, output] = command.communicate_utf8(null, null);
assert(command.get_successful() && output === 'Geist Mono', 'Bundled mono is discovered by Fontconfig');
const link = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), 'fonts', 'lightos-geist']));
assets.destroy(); assets.destroy();
assert(!link.query_exists(null), 'Removes only owned font registration');
link.make_directory(null);
failed = false;
try { assets.ensure(); } catch { failed = true; }
assets.destroy();
assert(failed && link.query_exists(null), 'Foreign directory is neither overwritten nor deleted');
link.delete(null);

print(`${checks} font profile checks passed (isolated settings and font registration)`);
