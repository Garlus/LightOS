// VM only. Invoke with isolated XDG_CONFIG_HOME, XDG_DATA_HOME, XDG_STATE_HOME
// and GSETTINGS_BACKEND=memory so no active user settings can be modified.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {PALETTES, readPalette, readFile, writeFile} from '../extension/palette.js';
import {TerminalThemes, ptyxisPalette} from '../extension/terminalThemes.js';

if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory' ||
    ![GLib.get_user_config_dir(), GLib.get_user_data_dir(), GLib.get_user_state_dir()]
        .every(path => path.startsWith('/tmp/')))
    throw new Error('Run in an isolated /tmp environment with the memory GSettings backend');
let checks = 0;
function assert(condition, message) {
    checks++;
    if (!condition) throw new Error(message);
}
const dir = Gio.File.new_for_path(GLib.get_current_dir()).get_child('extension');
const library = PALETTES.map(id => readPalette(dir, id));
for (const palette of library) {
    for (const mode of ['light', 'dark']) {
        const ini = new GLib.KeyFile();
        const source = ptyxisPalette(palette, mode, library);
        ini.load_from_data(source, new TextEncoder().encode(source).length, GLib.KeyFileFlags.NONE);
        for (const key of ['Foreground', 'Background', 'CursorBackground', 'CursorForeground',
            'TitlebarBackground', 'TitlebarForeground', ...Array.from({length: 16}, (_, i) => `Color${i}`)])
            assert(/^#[a-f0-9]{6}$/.test(ini.get_string('Palette', key)), `${palette.id}/${mode}/${key}`);
        assert(!/padding|radius|margin|font|scale|columns|rows/i.test(source), 'Palette changes colors only');
    }
}
const settings = new Gio.Settings({schema_id: 'org.gnome.Ptyxis'});
const uuid = 'abcdef0123456789abcdef0123456789ab';
const profile = new Gio.Settings({schema_id: 'org.gnome.Ptyxis.Profile',
    path: `/org/gnome/Ptyxis/Profiles/${uuid}/`});
settings.set_string('default-profile-uuid', uuid);
const theme = new TerminalThemes(dir);
theme.apply(library[0], 'light');
assert(profile.get_string('palette') === 'lightos-ocean-light', '32-character default profile recolored');
assert(settings.get_string('interface-style') === 'light', 'Native GTK4 interface follows light mode');
for (const palette of library) {
    for (const mode of ['light', 'dark']) {
        theme.apply(palette, mode);
        assert(profile.get_string('palette') === `lightos-${palette.id}-${mode}`, 'All 12 variants selected');
    }
}
const file = GLib.build_filenamev([GLib.get_user_data_dir(), 'org.gnome.Ptyxis', 'palettes', 'lightos-ocean-light.palette']);
assert(readFile(file).includes('Background=#f5f7f8'), 'Ocean GTK4 terminal palette installed');
theme.restore();
assert(profile.get_user_value('palette') === null, 'Default profile original unset state restored');
assert(settings.get_user_value('interface-style') === null, 'Native interface original unset state restored');
assert(readFile(file) === null, 'Generated palette removed');
// Reusing a manager must reconnect its first-launch/default-profile watches.
theme.apply(library[0], 'light');
const secondUuid = '11111111111111111111111111111111';
settings.set_string('default-profile-uuid', secondUuid);
const second = new Gio.Settings({schema_id: 'org.gnome.Ptyxis.Profile',
    path: `/org/gnome/Ptyxis/Profiles/${secondUuid}/`});
assert(second.get_string('palette') === 'lightos-ocean-light', 'Default profile changes recolored without recreation');
second.set_string('palette', 'gnome');
writeFile(file, readFile(file) + '# User edit\n');
theme.apply(library[0], 'dark');
assert(second.get_string('palette') === 'gnome', 'User palette selection preserved on later apply');
assert(readFile(file).endsWith('# User edit\n'), 'User palette file edit preserved on later apply');
theme.restore();
assert(second.get_string('palette') === 'gnome', 'User palette selection preserved on restore');
assert(readFile(file).endsWith('# User edit\n'), 'User palette file edit preserved on restore');
print(`${checks} GTK4 terminal checks passed`);
