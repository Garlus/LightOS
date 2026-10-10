#!/usr/bin/env python3
"""Validate installed ChromaLeon in the VM; Looking Glass Eval must be enabled there first."""
import ast
import json
import shlex
import subprocess
import time
from vm import ROOT, Monitor, ssh_args

EXT='Main.extensionManager.lookup("lightos@lightos.dev").stateObj'
ENV='export XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus; '
REPORT=ROOT/'docs/chromaleon-validation.json'

def shell(command):
    return subprocess.check_output(ssh_args()+[ENV+command],text=True).strip()

def evaluate(expression):
    raw=shell('gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval '+shlex.quote(expression))
    if not raw.startswith('(true, '): raise RuntimeError(raw)
    data=ast.literal_eval(raw[7:-1]); return json.loads(data) if data else None

def option(key,value):
    method='boolean' if isinstance(value,bool) else 'int' if isinstance(value,int) else 'string'
    evaluate(f'{EXT}._settings.set_{method}({json.dumps(key)},{json.dumps(value)})')
    time.sleep(.15)

def capture(name):
    time.sleep(.5)
    path=ROOT/'docs/screenshots/gnome'/f'{name}.png'
    with Monitor() as monitor: monitor.call('screendump',filename=str(path),format='png')
    print(name,flush=True)

def geometry():
    return json.loads(shell('python3 ~/LightOS-GNOME-project/tests/gnome-geometry.py 2>/tmp/lightos-chroma-geometry.log').splitlines()[-1])

def wait(expression, predicate, seconds=20):
    until=time.monotonic()+seconds
    while time.monotonic()<until:
        value=evaluate(expression)
        if predicate(value): return value
        time.sleep(.2)
    raise RuntimeError(f'Timed out: {expression}: {value}')

def main():
    report={'platform':shell('gnome-shell --version'),'version':5,'automatedChecks':878,'checks':{},'geometry':{}}
    background=evaluate(f'[{EXT}._chroma.background.get_string("picture-uri"),{EXT}._chroma.background.get_string("picture-uri-dark")]')
    try:
        shell('gnome-extensions disable lightos@lightos.dev')
        originals={version:shell(f'test ! -f ~/.config/gtk-{version}/gtk.css || sha256sum ~/.config/gtk-{version}/gtk.css') for version in ['3.0','4.0']}
        icon_original=shell('gsettings get org.gnome.desktop.interface icon-theme')
        shell('gsettings set org.gnome.desktop.interface color-scheme prefer-light')
        report['geometry']['nativeLight']=geometry()
        shell('gnome-extensions enable lightos@lightos.dev'); option('appearance','light'); option('color-engine','chromaleon')
        evaluate(f'{EXT}._chroma.background.set_string("picture-uri","file:///usr/share/backgrounds/gnome/amber-l.jxl")')
        colors=wait(f'{EXT}._settings.get_strv("chroma-colors")',lambda c: len(c)>0 and c[0]!='#4476fd')
        report['wallpaperColors']=colors
        report['geometry']['chromaLight']=geometry()
        assert report['geometry']['nativeLight']==report['geometry']['chromaLight']
        report['checks']['gtkLightGeometry']=True
        capture('chromaleon-light-desktop')
        evaluate('Main.panel.statusArea.quickSettings.menu.open()'); capture('chromaleon-light-quick-settings')
        evaluate('Main.panel.statusArea.quickSettings.menu.close()')
        option('chroma-full-light',True); capture('chromaleon-full-light'); option('chroma-full-light',False)
        option('chroma-strength',3); capture('chromaleon-strong-tint'); option('chroma-strength',1)
        option('chroma-tint-panel',False); capture('chromaleon-native-panel'); option('chroma-tint-panel',True)
        option('chroma-tint-gtk3',False)
        assert 'BEGIN LightOS' not in shell('cat ~/.config/gtk-3.0/gtk.css 2>/dev/null || true')
        report['checks']['gtk3OptOut']=True; option('chroma-tint-gtk3',True)
        option('chroma-flatpak',False); option('chroma-flatpak',True)
        option('chroma-recolor-folders',True)
        theme=wait(f'{EXT}._interface.get_string("icon-theme")',lambda s:s.startswith('LightOSChromaLeon-'),40)
        report['generatedIconTheme']=theme
        option('chroma-recolor-apps',True)
        wait(f'{EXT}._interface.get_string("icon-theme")',lambda s:s.startswith('LightOSChromaLeon-') and s.endswith('110'),40)
        report['checks']['folderAndAppIconEngine']=True
        shell('nautilus ~/Documents >/tmp/lightos-chroma-nautilus.log 2>&1 &')
        time.sleep(1); capture('chromaleon-icon-colors')
        option('chroma-create-shortcut',True)
        assert shell('test -f ~/.local/share/applications/dev.lightos.Appearance.desktop && echo yes')=='yes'
        option('chroma-create-shortcut',False)
        assert shell('test ! -f ~/.local/share/applications/dev.lightos.Appearance.desktop && echo yes')=='yes'
        report['checks']['launcherRoundTrip']=True
        shell('printf ".lightos #panel { background-color: @@ACCENT@@; padding: 99px; }" >/tmp/lightos-chroma-custom.css')
        panel_before=evaluate('Main.panel.get_theme_node().get_background_color().to_string()')
        option('chroma-custom-path','/tmp/lightos-chroma-custom.css'); option('chroma-custom-css',True)
        wait('Main.panel.get_theme_node().get_background_color().to_string()',lambda c:c!=panel_before)
        css=shell('cat ~/.cache/lightos-gnome/shell-colors.css')
        assert 'padding' not in css and '.lightos #panel' in css
        report['checks']['customColorsNoGeometry']=True; capture('chromaleon-custom-css')
        option('chroma-custom-css',False)
        wait('Main.panel.get_theme_node().get_background_color().to_string()',lambda c:c==panel_before)
        report['checks']['customStyleVisibleRoundTrip']=True
        option('chroma-recolor-apps',False); option('chroma-recolor-folders',False)
        assert shell('gsettings get org.gnome.desktop.interface icon-theme')==icon_original
        report['checks']['iconSettingRestored']=True
        option('appearance','dark')
        shell('gnome-extensions disable lightos@lightos.dev; gsettings set org.gnome.desktop.interface color-scheme prefer-dark')
        report['geometry']['nativeDark']=geometry()
        shell('gnome-extensions enable lightos@lightos.dev'); option('color-engine','chromaleon'); option('appearance','dark')
        report['geometry']['chromaDark']=geometry()
        assert report['geometry']['nativeDark']==report['geometry']['chromaDark']
        report['checks']['gtkDarkGeometry']=True
        evaluate('Main.panel.statusArea.quickSettings.menu.open()'); capture('chromaleon-dark-quick-settings')
        evaluate('Main.panel.statusArea.quickSettings.menu.close()')
        option('chroma-darker',True); capture('chromaleon-darker'); option('chroma-darker',False)
        option('chroma-gnome-colors',True)
        accent=evaluate(f'{EXT}._interface.get_string("accent-color")')
        assert accent in ['blue','teal','green','yellow','orange','red','pink','purple','slate']
        report['checks']['gnomeAccentMode']=True; capture('chromaleon-gnome-accent'); option('chroma-gnome-colors',False)
        shell('gnome-extensions disable lightos@lightos.dev')
        for version in ['3.0','4.0']:
            restored=shell(f'test ! -f ~/.config/gtk-{version}/gtk.css || sha256sum ~/.config/gtk-{version}/gtk.css')
            assert restored==originals[version], (version,originals[version],restored)
        assert shell('gsettings get org.gnome.desktop.interface icon-theme')==icon_original
        report['checks']['disableRestoresOriginalFiles']=True
        shell('gnome-extensions enable lightos@lightos.dev')
    finally:
        # Leave the user's standard Ocean palette and native GNOME desktop ready for testing.
        try:
            shell('gnome-extensions enable lightos@lightos.dev')
            option('chroma-recolor-apps',False); option('chroma-recolor-folders',False)
            option('chroma-custom-css',False); option('chroma-custom-path','')
            option('chroma-gnome-colors',False); option('chroma-strength',1)
            option('chroma-tint-gtk3',True); option('chroma-flatpak',True)
            option('chroma-tint-panel',True); option('chroma-full-light',False); option('chroma-darker',False)
            option('color-engine','t3'); option('palette','ocean'); option('appearance','light')
            evaluate(f'{EXT}._chroma.background.set_string("picture-uri",{json.dumps(background[0])}); {EXT}._chroma.background.set_string("picture-uri-dark",{json.dumps(background[1])})')
            evaluate('global.context.unsafe_mode = false')
        finally:
            REPORT.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps(report['checks'],indent=2))

if __name__=='__main__': main()
