// Each writable path is an explicit temporary fixture. Importing/applying this
// test cannot touch the session's actual XDG or Flatpak configuration.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {readPalette, readFile, writeFile} from '../extension/palette.js';
import {ExtraThemes, parseJSONC, editJSONC, editINI, iniValue, editorColors,
    kdeColors, qtctColors, kdeEditorTheme} from '../extension/extraThemes.js';

let checks = 0;
function assert(condition, message) {
    checks++;
    if (!condition) throw new Error(message);
}
function json(text) { return parseJSONC(text).value; }
const paletteDir = Gio.File.new_for_path(GLib.get_current_dir()).get_child('extension');
const palette = readPalette(paletteDir, 'ocean');
const c = palette.variants.light;

let document = `// Before\n{\n  // User URL and commas are not token separators.\n  "url": "https://example.test/a,b",\n  "workbench.colorCustomizations": {"editor.background": "#123456",},\n  "editor.fontSize": 14,\n}\n// After\n`;
const edited = editJSONC(document, ['workbench.colorCustomizations', 'editor.background'], {present: true, value: c.codeBackground});
assert(edited.includes('// Before') && edited.includes('// After') && edited.includes('// User URL'), 'JSONC comments retained');
assert(json(edited)['editor.fontSize'] === 14, 'Unrelated settings retained');
assert(json(edited)['workbench.colorCustomizations']['editor.background'] === c.codeBackground, 'Existing leaf changed');
let removed = editJSONC(edited, ['editor.fontSize'], {present: false});
assert(!Object.hasOwn(json(removed), 'editor.fontSize'), 'Last trailing-comma property removed');
removed = editJSONC('{"a":1,"b":2}', ['b'], {present: false});
assert(json(removed).a === 1, 'Last property preceding comma removed');
removed = editJSONC('{"a":1,/* comment */"b":2}', ['a'], {present: false});
assert(json(removed).b === 2 && removed.includes('/* comment */'), 'First property retains next comment');
assert(json(editJSONC('{}', ['a', 'b', 'c'], {present: true, value: 3})).a.b.c === 3, 'Missing parents inserted');
for (const invalid of ['{"a":1,"a":2}', '{/* missing', '{"a":bad}', '{"a":1}[]']) {
    let rejected = false; try { parseJSONC(invalid); } catch { rejected = true; }
    assert(rejected, 'Malformed JSONC rejected');
}
assert(iniValue(editINI('[A]', ['A', 'color'], {present: true, value: '#abcdef'}), ['A', 'color']).value === '#abcdef', 'INI missing header newline handled');
assert(kdeColors(c).every(entry => entry.keys[0].startsWith('Colors:') && /^\d+,\d+,\d+$/.test(entry.value)), 'KDE entries are color-only');
for (const major of [5, 6]) {
    const value = iniValue(qtctColors(c, major), ['ColorScheme', 'active_colors']).value;
    assert(value.split(', ').length === (major === 5 ? 21 : 22), 'Qt role array length');
    assert(value.split(', ')[7] === '#ff' + c.text.slice(1), 'Bright text retains contrast on native surface');
}
assert(Object.keys(editorColors(c)).every(key => !/font|padding|radius|width|height/.test(key)), 'Electron overrides only colors');

const temporary = GLib.dir_make_tmp('lightos-extra-tests-XXXXXX');
const options = {configDir: temporary + '/config', dataDir: temporary + '/data', stateDir: temporary + '/state', privateRoot: temporary + '/flatpak'};
const code = options.configDir + '/Code/User/settings.json';
const qt = options.configDir + '/qt6ct/qt6ct.conf';
const kde = options.configDir + '/kdeglobals';
const kwrite = options.configDir + '/kwriterc';
const app = options.privateRoot + '/org.gnome.Calculator/config';
const flatCode = options.privateRoot + '/com.visualstudio.code/config/Code/User/settings.json';
const css = app + '/gtk-4.0/gtk.css';
writeFile(code, document);
writeFile(qt, '[Appearance]\nstyle=Adwaita\ncustom_palette=false\ncolor_scheme_path=/old.conf\n[Fonts]\ngeneral=Adwaita Sans,11\n');
writeFile(kde, '[KDE]\nwidgetStyle=Adwaita\n[Colors:Window]\nBackgroundNormal=1,2,3\n');
writeFile(kwrite, '[KTextEditor Renderer]\nColor Theme=Breeze Light\nAuto Color Theme Selection=true\nText Font=Adwaita Mono,11\nLine Height Multiplier=1.2\n');
writeFile(css, '/* private existing css */');
writeFile(flatCode, '{"workbench.colorTheme":"My favorite theme","editor.fontSize":15}\n');
const originals = new Map([code, qt, kde, kwrite, css, flatCode].map(path => [path, readFile(path)]));
const manager = new ExtraThemes(options);
manager.apply(palette, 'light');
assert(json(readFile(code))['workbench.colorCustomizations']['editor.background'] === c.codeBackground, 'Installed Code colored');
assert(json(readFile(flatCode))['workbench.colorTheme'] === 'My favorite theme', 'Existing Electron theme preserved');
assert(readFile(qt).includes('style=Adwaita') && readFile(qt).includes('general=Adwaita Sans,11'), 'Qt style and font untouched');
assert(readFile(kde).includes('widgetStyle=Adwaita'), 'KDE widget style untouched');
assert(iniValue(readFile(kwrite), ['UiSettings', 'ColorScheme']).value === 'LightOSGNOME', 'KDE manager explicit native palette selected on GNOME');
assert(iniValue(readFile(kde), ['General', 'ColorScheme']).value === 'LightOSGNOME', 'Global native named color scheme selected');
const scheme = options.dataDir + '/color-schemes/LightOSGNOME.colors';
assert(iniValue(readFile(scheme), ['Colors:Window', 'BackgroundNormal']).value === '245,247,248', 'Named scheme contains actual palette');
const syntax = JSON.parse(readFile(options.dataDir + '/org.kde.syntax-highlighting/themes/lightos-gnome-kwrite.theme'));
assert(syntax['editor-colors'].BackgroundColor === c.codeBackground, 'KWrite editor surface colored');
assert(syntax['editor-colors'].TextSelection === c.accent, 'KWrite editor selection colored');
assert(syntax['text-styles'].Keyword.bold === true && syntax['text-styles'].Normal.bold === false, 'Native syntax formatting retained');
assert(readFile(kwrite).includes('Text Font=Adwaita Mono,11') && readFile(kwrite).includes('Line Height Multiplier=1.2'), 'KWrite typography and geometry retained');
assert(readFile(css).includes('--window-bg-color'), 'Private Flatpak GTK4 colored');
assert(readFile(css).includes('/* private existing css */'), 'Private CSS retained');
assert(!/padding|margin|radius|font|width|height/.test(readFile(css)), 'Private CSS has no geometry changes');
manager.apply(palette, 'dark');
new ExtraThemes(options).restore();
for (const [path, original] of originals) assert(readFile(path) === original, 'Exact original restoration: ' + path);
assert(readFile(app + '/gtk-3.0/gtk.css') === null, 'New private GTK3 file removed');
assert(readFile(options.configDir + '/qt6ct/colors/lightos-gnome.conf') === null, 'New Qt palette removed');
assert(readFile(scheme) === null && readFile(options.dataDir + '/org.kde.syntax-highlighting/themes/lightos-gnome-kwrite.theme') === null, 'Generated KDE schemes removed');

// User edits during operation survive both a palette change and disabling.
manager.apply(palette, 'light');
let current = readFile(code);
current = editJSONC(current, ['editor.fontSize'], {present: true, value: 19});
current = editJSONC(current, ['workbench.colorCustomizations', 'editor.background'], {present: true, value: '#999999'});
writeFile(code, current);
writeFile(kde, readFile(kde) + '[New User Setting]\nvalue=retained\n');
writeFile(css, readFile(css) + 'button { color: #123456; }\n');
manager.apply(palette, 'dark');
assert(json(readFile(code))['workbench.colorCustomizations']['editor.background'] === '#999999', 'User color edit survives palette change');
new ExtraThemes(options).restore();
assert(json(readFile(code))['editor.fontSize'] === 19, 'Unrelated user JSON edit survives restore');
assert(json(readFile(code))['workbench.colorCustomizations']['editor.background'] === '#999999', 'User color edit survives restore');
assert(!Object.hasOwn(json(readFile(code))['workbench.colorCustomizations'], 'button.background'), 'Unchanged managed colors restored');
assert(readFile(kde).includes('value=retained'), 'Unrelated user INI edit retained');
assert(iniValue(readFile(kde), ['Colors:Window', 'BackgroundNormal']).value === '1,2,3', 'Managed INI value restored after concurrent edit');
assert(readFile(css).includes('button { color: #123456; }') && !readFile(css).includes('BEGIN LightOS'), 'Concurrent private CSS retained and block removed');

// Replacing a managed file by a symlink must never write through it.
const target = temporary + '/target.json';
writeFile(target, '{"original":true}\n');
Gio.File.new_for_path(code).delete(null);
Gio.File.new_for_path(code).make_symbolic_link(target, null);
manager.apply(palette, 'light');
assert(readFile(target) === '{"original":true}\n', 'Symlink outside managed root not followed');
manager.restore();

// Delete only this fixture, never any actual config or private Flatpak tree.
function removeTree(path) {
    const file = Gio.File.new_for_path(path);
    if (file.query_file_type(Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null) === Gio.FileType.DIRECTORY) {
        const enumerator = file.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
        let info; while ((info = enumerator.next_file(null))) removeTree(path + '/' + info.get_name());
        enumerator.close(null);
    }
    file.delete(null);
}
removeTree(temporary);
print(`${checks} extra app color checks passed`);
