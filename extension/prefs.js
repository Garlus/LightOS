import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import Cairo from 'cairo';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {readPalette, PALETTES} from './palette.js';
import {chooseColor, validColor, ACCENTS, mix} from './chromaleon/engine.js';

function rgb(hex) {return hex.slice(1).match(/../g).map(c => parseInt(c,16)/255);}
function paint(cr,color,x,y,w,h) {cr.setSourceRGB(...rgb(color)); cr.rectangle(x,y,w,h); cr.fill();}
function preview(colors, scheme = false, selected = () => false) {
    const area = new Gtk.DrawingArea({content_width:210,content_height:scheme ? 102 : 62,hexpand:true});
    area.set_draw_func((_area,cr,w,h) => {
        if (scheme) {
            colors.forEach((c,index) => {
                const start = colors.length===2 ? index*w/2 : 0;
                cr.save(); cr.rectangle(start,0,colors.length===2 ? w/2 : w,h); cr.clip();
                paint(cr,c.canvas,0,0,w,h); paint(cr,c.sidebar,0,0,w*.22,h);
                paint(cr,c.accent,w*.37,h*.16,w*.37,8);
                paint(cr,c.surfaceRaised,w*.3,h*.4,w*.46,5);
                paint(cr,c.surfaceRaised,w*.3,h*.51,w*.3,5);
                paint(cr,c.surfaceOverlay,w*.77,h*.22,w*.2,h*.45);
                paint(cr,c.accent,w*.81,h*.3,w*.1,4);
                paint(cr,c.surfaceRaised,w*.3,h*.8,w*.63,6);
                cr.restore();
            });
        } else {
            colors.forEach((c,i) => {
                const x = w*(i===0 ? .35 : .65), y=h/2, radius=Math.min(24,h*.4);
                const gradient = new Cairo.RadialGradient(x-radius*.3,y-radius*.4,2,x,y,radius);
                gradient.addColorStopRGB(0,...rgb(c.accent));
                gradient.addColorStopRGB(.65,...rgb(c.canvas));
                gradient.addColorStopRGB(1,...rgb(c.surfaceOverlay));
                cr.setSource(gradient); cr.arc(x,y,radius,0,Math.PI*2); cr.fill();
                if (selected()) {cr.setSourceRGB(...rgb(c.accent)); cr.setLineWidth(2);
                    cr.arc(x,y,radius+4,0,Math.PI*2); cr.stroke();}
            });
        }
    });
    return area;
}
function choice(title, artwork, onClick) {
    const box = new Gtk.Box({orientation:Gtk.Orientation.VERTICAL,spacing:8});
    box.append(artwork); box.append(new Gtk.Label({label:title}));
    const button = new Gtk.Button({child:box,hexpand:true,css_classes:['card']});
    button.connect('clicked',onClick);
    return button;
}
export default class LightOSPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(980,820);
        const settings = this.getSettings();
        const iface = new Gio.Settings({schema_id:'org.gnome.desktop.interface'});
        const page = new Adw.PreferencesPage({title:'Appearance',icon_name:'preferences-desktop-appearance-symbolic'});
        window.add(page);
        const buttons=[];
        const group = (title,description='') => {const g=new Adw.PreferencesGroup({title,description}); page.add(g); return g;};
        const schemes = group('Darstellung');
        const schemeGrid = new Gtk.Grid({column_spacing:12,column_homogeneous:true});
        schemes.add(schemeGrid);
        const base = readPalette(this.dir,'ocean').variants;
        ['system','light','dark'].forEach((id,i) => {
            const art = preview(id==='system' ? [base.light,base.dark] : [base[id]],true);
            const button = choice(['System','Hell','Dunkel'][i],art,() => settings.set_string('appearance',id));
            schemeGrid.attach(button,i,0,1,1);
            buttons.push([button,art,() => settings.get_string('appearance')===id]);
        });
        const themes=group('Themes','Sechs vorhandene Paletten · drei zusätzliche ChromaLeon-Farben aus dem Hintergrundbild.');
        const grid=new Gtk.Grid({column_spacing:12,row_spacing:12,column_homogeneous:true}); themes.add(grid);
        ['t3-code','t3-chat','grove','ocean','ember','iris'].forEach((id,i) => {
            const p=readPalette(this.dir,id);
            const selected=() => settings.get_string('color-engine')==='t3' && settings.get_string('palette')===id;
            const art=preview([p.variants.light,p.variants.dark],false,selected);
            const button=choice({'t3-code':'T3 Code','t3-chat':'T3 Chat',grove:'Grove',ocean:'Ocean',ember:'Ember',iris:'Iris'}[id],art,() => {
                settings.set_string('palette',id); settings.set_string('color-engine','t3');
            });
            grid.attach(button,i%3,Math.floor(i/3),1,1); buttons.push([button,art,selected]);
        });
        const chromaButtons=[];
        for(let i=0;i<3;i++) {
            const box=new Gtk.Box({orientation:Gtk.Orientation.VERTICAL,spacing:8});
            const label=new Gtk.Label();
            const button=new Gtk.Button({child:box,hexpand:true,css_classes:['card']});
            button.connect('clicked',() => {
                const color=settings.get_strv('chroma-colors')[i];
                chooseColor(settings,settings.get_string('chroma-wallpaper'),color);
            });
            grid.attach(button,i,2,1,1); chromaButtons.push({button,box,label,art:null});
        }
        const engine=new Adw.ComboRow({title:'Farb-Engine',model:Gtk.StringList.new(['T3 Code','ChromaLeon'])});
        themes.add(engine);
        engine.connect('notify::selected',() => settings.set_string('color-engine',engine.selected===1 ? 'chromaleon' : 't3'));
        const wallpaper=group('ChromaLeon · Hintergrundbild','Farben werden lokal aus dem aktuellen GNOME-Hintergrundbild berechnet.');
        const picture=new Gtk.Picture({height_request:155,can_shrink:true,content_fit:Gtk.ContentFit.COVER}); wallpaper.add(picture);
        let previewUri = null;
        const status=new Adw.ActionRow({title:'Hintergrundbild-Farben',subtitle:'Wird ausgewertet …'}); wallpaper.add(status);
        const toggles = [];
        function toggle(parent,key,title,subtitle='') {
            const row=new Adw.SwitchRow({title,subtitle}); settings.bind(key,row,'active',Gio.SettingsBindFlags.DEFAULT);
            parent.add(row); if(key.startsWith('chroma-')) toggles.push(row); return row;
        }
        const colors=group('ChromaLeon · Farben');
        toggle(colors,'chroma-gnome-colors','GNOME Farben','Native GNOME-Akzentfarbe anstelle der Hintergrundbildfarbe verwenden.');
        toggle(colors,'chroma-persistent','Persistent Choices','Die gewählte Farbe für jedes Hintergrundbild merken.');
        toggle(colors,'chroma-prefer-light','Bevorzuge den hellen Stil','Shell im hellen GNOME-Design ebenfalls hell einfärben.');
        const fullLight=toggle(colors,'chroma-full-light','Durchgehend hell','Auch die obere Leiste im hellen Stil einfärben.');
        const tint=group('ChromaLeon · GNOME einfärben','Farbregeln aus ChromaLeon; native Formen und Abstände bleiben erhalten.');
        toggle(tint,'chroma-tint-shell','Shell einfärben','Hintergrundflächen der GNOME Shell in die Akzentfarbe mischen.');
        const panel=toggle(tint,'chroma-tint-panel','Obere Leiste im dunklen Stil einfärben');
        toggle(tint,'color-apps','Anwendungen einfärben','GTK 4, libadwaita und die vorhandenen LightOS-App-Anbindungen.');
        toggle(tint,'chroma-tint-apps','Anwendungsflächen einfärben','ChromaLeon-Farbmischung zusätzlich zur Akzentfarbe anwenden.');
        const gtk3=toggle(tint,'chroma-tint-gtk3','GTK3-Anwendungen einfärben','Native GTK3-Farbregeln; keine weitere Erweiterung erforderlich.');
        const strength=new Adw.ComboRow({title:'Einfärbeintensität',model:Gtk.StringList.new(['Dezent','Standard','Stark','Stärker'])});
        tint.add(strength); settings.bind('chroma-strength',strength,'selected',Gio.SettingsBindFlags.DEFAULT); toggles.push(strength);
        toggle(tint,'chroma-darker','Dunkler einfärben','Dunklere Hintergrundflächen verwenden.');
        const icons=group('ChromaLeon · Symbol-Design','Optional: bestehende SVG-Formen behalten, deren Farben anpassen.');
        toggle(icons,'chroma-recolor-folders','Ordnersymbol-Design','Akzentfarbe auf Adwaita-Ordnersymbole anwenden.');
        toggle(icons,'chroma-recolor-apps','Anwendungssymbol-Design','Akzentfarbe auf unterstützte Anwendungssymbole anwenden.');
        const more=toggle(icons,'chroma-morewaita','MoreWaita','Vorhandenes MoreWaita-Symbolpaket einbeziehen; keine automatische Installation.');
        const custom=group('ChromaLeon · Anpassung');
        const customRow=toggle(custom,'chroma-custom-css','Benutzerdefiniertes Stylesheet','Shell-Farbregeln mit @@ACCENT@@ ergänzen; Größenangaben werden ignoriert.');
        const fileRow=new Adw.ActionRow({title:'Stylesheet auswählen'});
        const open=new Gtk.Button({label:'Datei öffnen',valign:Gtk.Align.CENTER}); fileRow.add_suffix(open); custom.add(fileRow);
        const openHandler=open.connect('clicked',() => {
            const dialog=new Gtk.FileDialog({title:'Shell-Stylesheet auswählen'});
            dialog.open(window,null,(obj,res) => {
                try {const file=obj.open_finish(res); if(file?.get_path()) settings.set_string('chroma-custom-path',file.get_path());}
                catch(error) {if(!error.matches(Gtk.DialogError,Gtk.DialogError.DISMISSED)) console.warn(error.message);}
            });
        });
        const misc=group('ChromaLeon · Verschiedenes');
        const hot=new Adw.ComboRow({title:'Hot Reload',subtitle:'Standard verwendet ChromaLeons kurzzeitiges Kontrastsignal für GTK4.',model:Gtk.StringList.new(['Aus','Standard (empfohlen)'])});
        misc.add(hot); settings.bind('chroma-hot-reload',hot,'selected',Gio.SettingsBindFlags.DEFAULT); toggles.push(hot);
        toggle(misc,'chroma-flatpak','Auf Flatpaks anwenden','Bestehende private App-Konfigurationen verwenden; keine zusätzlichen Sandbox-Rechte.');
        toggle(misc,'chroma-create-shortcut','Tastenkürzel aktivieren','Eine LightOS-Appearance-Verknüpfung im Anwendungsraster erstellen.');
        const layout=new Adw.PreferencesPage({title:'LightOS',icon_name:'preferences-system-symbolic'}); window.add(layout);
        const search=new Adw.PreferencesGroup({title:'Top Bar und Suche'}); layout.add(search);
        search.add(new Adw.ActionRow({title:'Suche öffnen',subtitle:'Super + Leertaste'}));
        search.add(new Adw.ActionRow({title:'GNOME-Suchanbieter',subtitle:'Dateien, Rechner und Einstellungen unter GNOME Einstellungen → Suchen aktivieren.'}));
        const restore=new Adw.PreferencesGroup({title:'Wiederherstellung',description:'Beim Deaktivieren werden verwaltete Farben und Icon-Einstellungen wiederhergestellt. Eigene CSS-Regeln bleiben erhalten.'}); layout.add(restore);
        const sync=() => {
            for(const [button,art,selected] of buttons) {
                const label=button.get_child().get_last_child();
                if(selected()) label.add_css_class('accent'); else label.remove_css_class('accent');
                art.queue_draw();
            }
            const isChroma=settings.get_string('color-engine')==='chromaleon';
            engine.selected=isChroma ? 1 : 0;
            const extracted=settings.get_strv('chroma-colors').slice(0,3);
            chromaButtons.forEach(({button,box,label,art},i) => {
                if(art) box.remove(art);
                const color=extracted[i]; button.sensitive=!!color && !settings.get_boolean('chroma-gnome-colors');
                const c=validColor(color) ? color : ACCENTS.slate;
                const selected=() => isChroma && color===settings.get_string('chroma-accent') && !settings.get_boolean('chroma-gnome-colors');
                const view=preview([{accent:c,canvas:mix('#fafafb',c,.12),surfaceOverlay:'#ffffff'},
                    {accent:c,canvas:mix('#222226',c,.1),surfaceOverlay:'#141416'}],false,selected);
                box.prepend(view); chromaButtons[i].art=view;
                if(!label.get_parent()) box.append(label);
                label.label=color ? `ChromaLeon · ${i+1}  ${color.toUpperCase()}` : `ChromaLeon · ${i+1}  —`;
                if(selected()) label.add_css_class('accent'); else label.remove_css_class('accent');
            });
            const uri=settings.get_string('chroma-wallpaper');
            if (previewUri !== uri) {
                previewUri = uri;
                try {
                    // GTK's texture loaders do not cover every GNOME wallpaper format (e.g. JXL).
                    const path = uri.startsWith('file://') ? Gio.File.new_for_uri(uri).get_path() : null;
                    const pixbuf = path ? GdkPixbuf.Pixbuf.new_from_file_at_scale(path,720,400,true) : null;
                    picture.set_paintable(pixbuf ? Gdk.Texture.new_for_pixbuf(pixbuf) : null);
                } catch (error) {picture.set_paintable(null); console.warn(`LightOS wallpaper preview: ${error.message}`);}
            }
            status.subtitle=settings.get_string('chroma-error') || (extracted.length ? `${extracted.length} Farben · Auswahl in der dritten Theme-Zeile` : 'Keine Farben verfügbar');
            for(const row of toggles) row.sensitive=isChroma;
            fullLight.sensitive=isChroma && settings.get_boolean('chroma-prefer-light');
            panel.sensitive=isChroma && settings.get_boolean('chroma-tint-shell');
            gtk3.sensitive=isChroma && settings.get_boolean('color-apps');
            const moreInstalled=['/usr/share/icons/MoreWaita',`${GLib.get_user_data_dir()}/icons/MoreWaita`].some(path=>Gio.File.new_for_path(path).query_exists(null));
            more.sensitive=isChroma && moreInstalled;
            more.subtitle=moreInstalled ? 'Vorhandenes MoreWaita-Symbolpaket einbeziehen.' : 'MoreWaita ist nicht installiert.';
            open.sensitive=isChroma; fileRow.subtitle=settings.get_string('chroma-custom-path') || 'Noch keine Datei gewählt';
            customRow.sensitive=isChroma && !!settings.get_string('chroma-custom-path');
        };
        const signal=settings.connect('changed',sync); sync();
        window.connect('close-request',() => {settings.disconnect(signal); open.disconnect(openHandler); return false;});
    }
}
