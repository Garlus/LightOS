// Run with isolated XDG_STATE_HOME; no desktop APIs or profile writes.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {SearchStore} from '../extension/searchStore.js';
import {recordUse, itemState} from '../extension/searchModel.js';
let checks = 0;
function assert(condition, message) { checks++; if (!condition) throw new Error(message); }
const root = GLib.getenv('XDG_STATE_HOME');
assert(root && root !== GLib.build_filenamev([GLib.get_home_dir(), '.local', 'state']), 'Requires isolated state directory');
const file = Gio.File.new_for_path(GLib.build_filenamev([root, 'lightos-gnome', 'search.json']));
const store = new SearchStore();
assert(store.state.history.length === 0, 'Missing state starts empty');
recordUse(store.state, 'app:example.desktop', 'Example');
itemState(store.state, 'app:example.desktop').favorite = true;
store.save();
const mode = file.query_info('unix::mode', 0, null).get_attribute_uint32('unix::mode') & 0o777;
assert(mode === 0o600, 'Personal state is private');
assert(new SearchStore().state.items['app:example.desktop'].favorite, 'Explicit preferences survive reload');
file.replace_contents(new TextEncoder().encode('{broken'), null, false, Gio.FileCreateFlags.PRIVATE, null);
assert(Object.keys(new SearchStore().state.items).length === 0, 'Corrupt state does not prevent search');
file.replace_contents(new TextEncoder().encode(' '.repeat(1048577)), null, false, Gio.FileCreateFlags.PRIVATE, null);
assert(Object.keys(new SearchStore().state.items).length === 0, 'Oversized state is ignored');
for (let i = 0; i < 512; i++) {
    const saved = itemState(store.state, `app:unicode${i}`);
    saved.alias = `alias${i}`;
    saved.terms = Array.from({length: 16}, (_, n) => `${n}${'漢'.repeat(79)}`);
}
store.save();
assert(file.query_info('standard::size', 0, null).get_size() <= 1048576, 'UTF-8 state respects the load byte limit');
assert(Object.keys(new SearchStore().state.items).length === 512, 'Budget trimming retains personal item settings');
assert(new SearchStore().state.items['app:unicode511'].alias === 'alias511', 'UTF-8 trimming retains explicit aliases');
print(`${checks} search store checks passed (private atomic persistence, recovery, UTF-8 budget)`);
