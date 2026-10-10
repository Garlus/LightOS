import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import {AppColors,readFile,writeFile} from '../extension/palette.js';
import {strength,mix,colorOnly,appCss,shellCss,dynamicPalette,chooseColor,calculatePaletteColors} from '../extension/chromaleon/engine.js';
import {processPalette} from '../extension/chromaleon/vendor/colorUtils.js';
let checks=0;
function assert(value,message) {checks++; if(!value) throw new Error(message);}
const dir=Gio.File.new_for_path(GLib.get_current_dir()).get_child('extension');
const options={accent:'#3584e4',level:1,tintShell:true,tintPanel:true,tintApps:true,tintGtk3:true,darker:false,preferLight:true,fullLight:false};
assert(Math.abs(strength(0,.12,true)-.07)<.0001,'Subtle tint matches upstream');
assert(Math.abs(strength(3,.12,true)-.22)<.0001,'Strongest tint matches upstream');
assert(mix('#000000','#ffffff',.5)==='#808080','Surface colors use true channel mixing');
const filtered=colorOnly('/* radius */ .a {padding: 9px; color: #abcdef; border-radius: 3px; background-color: #123456; box-shadow: 0 0 8px black;}');
assert(!/padding|radius|shadow/.test(filtered) && filtered.includes('color: #abcdef'),'Only color properties survive');
for(const mode of ['light','dark']) for(const level of [0,1,2,3]) for(const darker of [false,true]) {
 const o={...options,level,darker}; const app=appCss(dir,o,mode); const shell=shellCss(dir,o,mode);
 assert(!/@@|padding:|margin:|radius:|font-size:|box-shadow:/.test(app['3.0']+app['4.0']),'Native GTK geometry preserved');
 assert(!/@@|padding:|margin:|radius:|font-size:|box-shadow:/.test(shell),'Native Shell geometry preserved');
 assert(shell.includes('st-mix(') && app['4.0'].includes('mix('),'Real upstream tint templates used');
}
assert(!/#panel \{ background-color:/.test(shellCss(dir,{...options,tintPanel:false},'dark')),'Panel tint can be disabled');
assert(!('3.0' in appCss(dir,{...options,tintGtk3:false},'light')),'GTK3 opt-out removes override');
const palette=dynamicPalette(dir,options);
assert(palette.id==='chromaleon' && palette.variants.light.accent===options.accent,'Additional app adapters receive dynamic palette');
const manager=new AppColors(); const path=GLib.build_filenamev([GLib.get_user_config_dir(),'gtk-3.0','gtk.css']);
writeFile(path,'/* Personal rules */'); manager.applyCss(appCss(dir,options,'light'));
manager.applyCss(appCss(dir,{...options,tintGtk3:false},'light'));
assert(readFile(path)==='/* Personal rules */','GTK3 opt-out preserves personal CSS');
manager.restore(); assert(readFile(path)==='/* Personal rules */','Original CSS restored after engine use');
const pixbuf=GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB,false,8,64,64); pixbuf.fill(0xff0000ff);
const solid=processPalette(pixbuf); assert(solid.length===1,'Solid wallpaper yields one genuine color');
const pixels=new Uint8Array(64*64*3);
for(let i=0;i<64*64;i++) {const rgb=i%3===0 ? [255,0,0] : i%3===1 ? [0,255,0] : [0,0,255]; pixels.set(rgb,i*3);}
const multicolor=GdkPixbuf.Pixbuf.new_from_bytes(GLib.Bytes.new(pixels),GdkPixbuf.Colorspace.RGB,false,8,64,64,64*3);
const three=processPalette(multicolor); assert(three.length===3 && new Set(three).size===3,'Three distinct wallpaper colors');
const file=GLib.build_filenamev([GLib.get_user_data_dir(),'wallpaper-test.png']); GLib.mkdir_with_parents(GLib.get_user_data_dir(),0o700);
multicolor.savev(file,'png',[],[]);
const asyncColors=await calculatePaletteColors(Gio.File.new_for_path(file).get_uri());
assert(asyncColors.length===3,'Actual asynchronous wallpaper decoder yields three colors');
let failed=false; try {await calculatePaletteColors('file:///does-not-exist-lightos.png');} catch {failed=true;}
assert(failed,'Missing wallpaper rejects rather than hanging');
const schemaDir=GLib.dir_make_tmp('lightos-chroma-schema-XXXXXX');
Gio.File.new_for_path(dir.get_child('schemas/org.gnome.shell.extensions.lightos.gschema.xml').get_path()).copy(
 Gio.File.new_for_path(schemaDir+'/org.gnome.shell.extensions.lightos.gschema.xml'),Gio.FileCopyFlags.NONE,null,null);
GLib.spawn_command_line_sync('glib-compile-schemas '+schemaDir);
const schema=Gio.SettingsSchemaSource.new_from_directory(schemaDir,Gio.SettingsSchemaSource.get_default(),false).lookup('org.gnome.shell.extensions.lightos',false);
const settings=new Gio.Settings({settings_schema:schema}); chooseColor(settings,'file:///wallpaper.png',three[1]);
assert(settings.get_string('color-engine')==='chromaleon','Wallpaper choice selects added engine');
assert(JSON.parse(settings.get_string('chroma-choices'))['file:///wallpaper.png']===three[1],'Choice persists per wallpaper');
chooseColor(settings,'file:///wallpaper.png','invalid'); assert(settings.get_string('chroma-accent')===three[1],'Invalid colors are rejected');
print(`${checks} ChromaLeon checks passed`);
