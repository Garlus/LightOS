// Run in the test VM with isolated XDG_CONFIG_HOME / XDG_STATE_HOME.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {calculate} from '../extension/calculator.js';
import {AppColors, PALETTES, gtkColors, readPalette, readFile, writeFile} from '../extension/palette.js';
import {AppThemes, sourceScheme} from '../extension/appThemes.js';

let checks = 0;
function assert(condition, message) {
    checks++;
    if (!condition) throw new Error(message);
}
const root = Gio.File.new_for_path(GLib.get_current_dir());
const dir = root.get_child('extension');
for (const [input, expected] of [
    ['12 * (3 + 4)', '84'], ['2^3^2', '512'], ['-2^2', '-4'], ['2^-3', '0.125'],
    ['1,5 + 2,5', '4'], ['0.1 + 0.2', '0.3'], ['12÷3×2', '8'], ['5%2', '1'],
    ['1/0', null], ['(2+3', null], ['2+3)', null], ['2+process.exit()', null],
    ['1; globalThis', null], ['2**3', null], ['1e999+1', null], [' '.repeat(161), null],
]) assert(calculate(input) === expected, `Calculation: ${input}`);

const allowedColorProperty = /^(--[a-z-]+)$/;
for (const id of PALETTES) {
    const palette = readPalette(dir, id);
    for (const mode of ['light', 'dark']) {
        const colors = palette.variants[mode];
        assert(Object.values(colors).every(color => /^#[a-f0-9]{6}$/.test(color)), `Hex colors: ${id}/${mode}`);
        const css = gtkColors(colors);
        assert(!/padding|margin|radius|font|width|height|spacing/i.test(css), `Geometry unchanged: ${id}/${mode}`);
        for (const declaration of css.matchAll(/^\s*([\w-]+):\s*([^;]+);$/gm))
            assert(allowedColorProperty.test(declaration[1]) && /^#[a-f0-9]{6}$/.test(declaration[2]), 'Color property only');
        assert(sourceScheme(palette, mode).includes(`parent-scheme="Adwaita${mode === 'dark' ? '-dark' : ''}"`), 'Native syntax inherited');
    }
}
assert(readPalette(dir, '../../invalid').id === 'ocean', 'Palette paths bounded');
const c = readPalette(dir, 'ocean').variants.light;
const path3 = GLib.build_filenamev([GLib.get_user_config_dir(), 'gtk-3.0', 'gtk.css']);
const path4 = GLib.build_filenamev([GLib.get_user_config_dir(), 'gtk-4.0', 'gtk.css']);
writeFile(path3, '/* Original custom CSS, no trailing newline */');
const manager = new AppColors();
manager.apply(c);
manager.apply(c);
assert((readFile(path3).match(/BEGIN LightOS/g) ?? []).length === 1, 'Repeated apply is idempotent');
manager.restore();
assert(readFile(path3) === '/* Original custom CSS, no trailing newline */', 'Exact original CSS restored');
assert(readFile(path4) === null, 'Previously missing CSS removed');
manager.apply(c);
writeFile(path3, readFile(path3) + 'button { color: #123456; }\n');
manager.restore();
assert(readFile(path3).includes('button { color: #123456; }'), 'Concurrent user edits survive restore');
assert(!readFile(path3).includes('BEGIN LightOS'), 'Managed block removed');

const editor = new Gio.Settings({schema_id: 'org.gnome.TextEditor'});
const original = editor.get_user_value('style-scheme')?.print(true) ?? null;
const testOptions = {extra: {privateRoot: GLib.build_filenamev([GLib.get_user_config_dir(), 'private-fixture'])}};
const themes = new AppThemes(dir, testOptions);
themes.apply(readPalette(dir, 'ocean'), 'light');
assert(editor.get_string('style-scheme') === 'lightos-ocean-light', 'Text editor scheme selected');
const recovered = new AppThemes(dir, testOptions);
recovered.restore();
assert((editor.get_user_value('style-scheme')?.print(true) ?? null) === original, 'GSettings exact restoration survives restart');
print(`${checks} GNOME checks passed`);
