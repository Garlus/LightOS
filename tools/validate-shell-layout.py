#!/usr/bin/env python3
"""Check light palettes, native menu geometry and optional 42 px panel in the VM.

Build/install/restart first. --enable-eval opens Looking Glass in the VM only.
Restores all tested settings and disables Shell Eval, including on failure.
"""
import argparse
import importlib
import json
import time
from vm import ROOT

v = importlib.import_module('validate-search')
EXT = v.EXT
REPORT = ROOT / 'docs/shell-layout-validation.json'
PALETTES = ['ocean', 'grove', 'ember', 'iris', 'rose']


def option(key, value):
    method = 'set_boolean' if isinstance(value, bool) else 'set_string'
    v.evaluate(f'{EXT}._settings.{method}({json.dumps(key)},{json.dumps(value)}); true')
    time.sleep(.35)


def measure():
    return v.evaluate('''(() => {
        const quick = Main.panel.statusArea.quickSettings;
        const date = Main.panel.statusArea.dateMenu;
        const color = actor => ({background:actor.get_theme_node().get_background_color().to_string(),
            foreground:actor.get_theme_node().get_foreground_color().to_string()});
        const geometry = actor => {const t=actor.get_theme_node(); return {
            radius:t.get_border_radius(0), padding:[0,1,2,3].map(side=>t.get_padding(side)),
            fontSize:t.get_font().get_size(),fontWeight:t.get_font().get_weight()};};
        return {height:Main.panel.height,panel:color(Main.panel),
            clock:color(date._clockDisplay),quick:color(quick.menu.box),calendar:{...color(date.menu.box),
                foreground:date._calendar.get_theme_node().get_foreground_color().to_string()},
            quickGeometry:geometry(quick.menu.box),calendarGeometry:geometry(date._calendar),
            workarea:(()=>{const r=global.workspace_manager.get_active_workspace().get_work_area_for_monitor(Main.layoutManager.primaryIndex); return {x:r.x,y:r.y,width:r.width,height:r.height};})(),
            nativeActivities:Main.panel.statusArea.activities.visible};
    })()''')


def light(color):
    return sum(int(color[i:i+2],16) for i in (1,3,5)) / 3 > 180


def dark(color):
    return sum(int(color[i:i+2],16) for i in (1,3,5)) / 3 < 120


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--enable-eval', action='store_true')
    args = parser.parse_args()
    if args.enable_eval: v.enable_eval()
    original = v.evaluate(f'Object.fromEntries(["palette","appearance","color-engine",'
        f'"panel-height-42","chroma-prefer-light","chroma-full-light","chroma-tint-shell"]'
        f'.map(k=>[k,{EXT}._settings.get_value(k).deep_unpack()]))')
    report = {'platform':v.shell('gnome-shell --version'), 'version':v.evaluate(f'{EXT}.metadata.version'),
              'checks':{},'palettes':{},'evidence':[]}
    try:
        v.evaluate(f'{EXT}._search.close(); true')
        option('panel-height-42',False)
        option('appearance','light')
        option('color-engine','t3')
        # Use the same native appearance for baseline and custom colors.
        v.shell('gnome-extensions disable lightos@lightos.dev; gsettings set org.gnome.desktop.interface color-scheme prefer-light')
        time.sleep(.6)
        baseline = measure()
        report['nativeBaseline'] = baseline
        v.shell('gnome-extensions enable lightos@lightos.dev')
        time.sleep(.7)
        for palette in PALETTES:
            option('palette',palette)
            v.evaluate('Main.panel.statusArea.quickSettings.menu.open(); true')
            time.sleep(.3)
            colors = measure()
            assert colors['panel']['background'] == '#ffffffff', colors
            assert colors['clock']['foreground'] == '#000000ff', colors
            assert light(colors['quick']['background']), colors
            assert dark(colors['quick']['foreground']), colors
            assert colors['quickGeometry'] == baseline['quickGeometry'], colors
            assert colors['height'] == baseline['height'], colors
            v.capture(f'light-{palette}-quick-settings')
            v.evaluate('Main.panel.statusArea.quickSettings.menu.close(); Main.panel.statusArea.dateMenu.menu.open(); true')
            time.sleep(.3)
            calendar = measure()
            assert light(calendar['calendar']['background']) and dark(calendar['calendar']['foreground']), calendar
            assert calendar['calendarGeometry'] == baseline['calendarGeometry'], calendar
            v.capture(f'light-{palette}-calendar')
            v.evaluate('Main.panel.statusArea.dateMenu.menu.close(); true')
            report['palettes'][palette] = colors
        option('palette','ocean')
        option('panel-height-42',True)
        expanded = measure()
        assert expanded['height'] == 42, expanded
        assert expanded['workarea']['y'] == 42, expanded
        v.evaluate('Main.panel.statusArea.quickSettings.menu.open(); true')
        v.capture('panel-42-light')
        v.evaluate('Main.panel.statusArea.quickSettings.menu.close(); true')
        option('appearance','dark')
        assert measure()['height'] == 42 and dark(measure()['panel']['background'])
        v.capture('panel-42-dark')
        option('appearance','light')
        option('color-engine','chromaleon')
        # Old configurations must not reintroduce a mixed light/dark Shell.
        option('chroma-prefer-light',False)
        option('chroma-full-light',False)
        for tinted in [False,True]:
            option('chroma-tint-shell',tinted)
            v.evaluate('Main.panel.statusArea.quickSettings.menu.open(); true')
            time.sleep(.3)
            current = measure()
            assert current['height'] == 42 and current['panel']['background'] == '#ffffffff', current
            assert current['clock']['foreground'] == '#000000ff' and light(current['quick']['background']), current
            assert current['quickGeometry'] == baseline['quickGeometry'], current
            v.capture('light-chromaleon-' + ('tinted' if tinted else 'accent'))
            v.evaluate('Main.panel.statusArea.quickSettings.menu.close(); Main.panel.statusArea.dateMenu.menu.open(); true')
            time.sleep(.3)
            current = measure()
            assert light(current['calendar']['background']) and dark(current['calendar']['foreground']), current
            v.capture('light-chromaleon-calendar-' + ('tinted' if tinted else 'accent'))
            v.evaluate('Main.panel.statusArea.dateMenu.menu.close(); true')
            report['palettes']['chromaleon-tinted' if tinted else 'chromaleon-accent'] = current
        option('panel-height-42',False)
        assert measure()['height'] == baseline['height'], measure()
        option('panel-height-42',True)
        v.shell('gnome-extensions disable lightos@lightos.dev')
        time.sleep(.5)
        assert measure()['height'] == baseline['height'], measure()
        v.shell('gnome-extensions enable lightos@lightos.dev')
        time.sleep(.7)
        assert measure()['height'] == 42, measure()
        report['checks'] = {'allLightPalettesWhitePanel':True,'nativeMenuGeometryPreserved':True,
            'panel42AndWorkarea':expanded,'heightIndependentOfAppearanceAndEngine':True,
            'toggleOffRestoresNativeHeight':True,'disableRestoresNativeHeight':True,'reenableRestores42':True}
        report['evidence'] = sorted('screenshots/gnome/' + p.name for p in v.EVIDENCE.glob('light-*-*.png')) + [
            'screenshots/gnome/panel-42-light.png','screenshots/gnome/panel-42-dark.png']
    finally:
        v.shell('gnome-extensions enable lightos@lightos.dev')
        v.evaluate('Main.panel.statusArea.quickSettings.menu.close(); Main.panel.statusArea.dateMenu.menu.close(); true')
        for key,value in original.items(): option(key,value)
        v.evaluate('global.context.unsafe_mode=false; true')
        report['shellEvalDisabled'] = v.shell('gdbus call --session --dest org.gnome.Shell '
            '--object-path /org/gnome/Shell --method org.gnome.Shell.Eval "1+1"').startswith('(false,')
        REPORT.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    assert report['shellEvalDisabled']
    print(json.dumps(report['checks'],indent=2),flush=True)


if __name__ == '__main__': main()
