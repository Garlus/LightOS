#!/usr/bin/env python3
"""Validate fully light overview and undimmed modal search in the GNOME VM.

Requires the current ZIP installed and the VM Wayland session restarted.
--enable-eval uses VM Looking Glass only. Settings and Shell Eval are restored.
"""
import argparse
import importlib
import json
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from vm import ROOT, Monitor
v = importlib.import_module('validate-search')
EXT = v.EXT
SEARCH = v.SEARCH
REPORT = ROOT / 'docs/overview-validation.json'
PALETTES = ['ocean', 'grove', 'ember', 'iris', 'rose']


def option(key, value):
    method = 'set_boolean' if isinstance(value, bool) else 'set_string'
    v.evaluate(f'{EXT}._settings.{method}({json.dumps(key)},{json.dumps(value)}); true')
    time.sleep(.35)


def measure():
    return v.evaluate('''(() => {
        const overview=Main.layoutManager.overviewGroup;
        const dash=Main.overview.dash._background;
        const color = actor => ({background:actor.get_theme_node().get_background_color().to_string(),
            foreground:actor.get_theme_node().get_foreground_color().to_string()});
        const geometry = actor => {const t=actor.get_theme_node();return {
            radius:t.get_border_radius(0),padding:[0,1,2,3].map(side=>t.get_padding(side)),
            fontSize:t.get_font().get_size()};};
        const item=Main.overview._overview.controls._appDisplay._orderedItems.find(item=>item.icon?.label);
        return {panel:color(Main.panel),overview:color(overview),dash:color(dash),dashGeometry:geometry(dash),
            appLabel:item ? color(item.icon.label) : null};
    })()''')


def light(color):
    return sum(int(color[i:i+2],16) for i in (1,3,5))/3 > 180


def dark(color):
    return sum(int(color[i:i+2],16) for i in (1,3,5))/3 < 120


def screenshot(path):
    with Monitor() as monitor:
        monitor.call('screendump',filename=str(path),format='png')


def unchanged_corners(before, after):
    from PIL import Image, ImageChops, ImageStat
    a,b=Image.open(before).convert('RGB'),Image.open(after).convert('RGB')
    width,height=a.size
    regions=[(16,80,96,160),(width-96,80,width-16,160),
             (16,height-112,96,height-32),(width-96,height-112,width-16,height-32)]
    difference=[]
    for box in regions:
        diff=ImageChops.difference(a.crop(box),b.crop(box))
        difference.append({'region':box,'mean':ImageStat.Stat(diff).mean,'maximum':max(v[1] for v in diff.getextrema())})
    assert all(d['maximum'] <= 1 for d in difference), difference
    return difference


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--enable-eval',action='store_true')
    args=parser.parse_args()
    if args.enable_eval: v.enable_eval()
    original=v.evaluate(f'Object.fromEntries(["palette","appearance","color-engine","chroma-tint-shell"]'
        f'.map(k=>[k,{EXT}._settings.get_value(k).deep_unpack()]))')
    report={'platform':v.shell('gnome-shell --version'),'version':v.evaluate(f'{EXT}.metadata.version'),
        'palettes':{},'checks':{},'evidence':[]}
    try:
        v.evaluate(f'{SEARCH}.close(); Main.overview.hide(); true')
        option('appearance','light')
        v.shell('gnome-extensions disable lightos@lightos.dev; gsettings set org.gnome.desktop.interface color-scheme prefer-light')
        time.sleep(.5)
        v.evaluate('Main.overview.show(); true')
        time.sleep(.5)
        baseline=measure()
        report['nativeBaseline']=baseline
        v.shell('gnome-extensions enable lightos@lightos.dev')
        time.sleep(.6)
        for palette in PALETTES:
            option('color-engine','t3'); option('palette',palette)
            v.evaluate('Main.overview.show(); Main.overview.dash.showAppsButton.checked=true; true')
            time.sleep(.6)
            current=measure()
            assert light(current['overview']['background']) and light(current['dash']['background']),current
            assert current['overview']['background']==current['panel']['background']=='#ffffffff',current
            assert current['appLabel'] and dark(current['appLabel']['foreground']),current
            assert current['dashGeometry']==baseline['dashGeometry'],current
            v.capture('overview-light-'+palette)
            report['palettes'][palette]=current
        option('color-engine','chromaleon')
        for tinted in [False,True]:
            option('chroma-tint-shell',tinted)
            time.sleep(.4)
            current=measure()
            assert light(current['overview']['background']) and light(current['dash']['background']),current
            assert current['overview']['background']==current['panel']['background']=='#ffffffff',current
            assert current['appLabel'] and dark(current['appLabel']['foreground']),current
            assert current['dashGeometry']==baseline['dashGeometry'],current
            name='chromaleon-tinted' if tinted else 'chromaleon-accent'
            report['palettes'][name]=current
            v.capture('overview-light-'+name)
        report['checks']['overviewMatchesWhitePanelAllPalettes']=True
        option('color-engine','t3');option('palette','ocean')
        v.evaluate('Main.overview.dash.showAppsButton.checked=false; true')
        v.capture('overview-light-windows')
        option('appearance','dark')
        assert dark(measure()['overview']['background']) and dark(measure()['dash']['background'])
        v.capture('overview-dark-regression')
        report['checks']['darkOverviewPreserved']=True
        # Verify background pixels, not just the absence of a shader object.
        for mode in ['light','dark']:
            v.evaluate('Main.overview.hide(); true')
            option('appearance',mode)
            time.sleep(.8)
            before=ROOT / f'.cache/vm-gnome/search-undimmed-{mode}-before.png'
            screenshot(before)
            v.query('firefx')
            assert v.evaluate(f'!{SEARCH}._dialog._lightbox && {SEARCH}._dialog._hasModal')
            name='search-undimmed-'+mode
            v.capture(name)
            after=v.EVIDENCE / f'{name}.png'
            report['checks']['unchangedBackground-'+mode]=unchanged_corners(before,after)
            assert v.evaluate(f'{SEARCH}._dialog._hasModal')
            if mode=='light':
                with Monitor() as monitor:
                    monitor.call('input-send-event',events=[dict(type='abs',data=dict(axis='x',value=1200)),
                        dict(type='abs',data=dict(axis='y',value=16000))])
                    monitor.call('input-send-event',events=[dict(type='btn',data=dict(button='left',down=True))])
                    time.sleep(.08)
                    monitor.call('input-send-event',events=[dict(type='btn',data=dict(button='left',down=False))])
                time.sleep(.3)
                assert not v.evaluate(f'{SEARCH}._dialog.visible')
                report['checks']['outsideClickClosesSearch']=True
            else:
                v.key('esc')
                assert not v.evaluate(f'{SEARCH}._dialog.visible')
                report['checks']['escapeClosesSearch']=True
        report['checks']['modalGrabWithoutLightbox']=True
        option('appearance','light')
        v.shell('gnome-extensions disable lightos@lightos.dev')
        time.sleep(.5)
        v.evaluate('Main.overview.show(); true')
        time.sleep(.4)
        assert measure()['overview']['background']==baseline['overview']['background']
        assert measure()['dashGeometry']==baseline['dashGeometry']
        report['checks']['disableRestoresNativeOverview']=True
        report['evidence']=sorted('screenshots/gnome/'+p.name for pattern in ['overview-light-*.png',
            'overview-dark-regression.png','search-undimmed-*.png'] for p in v.EVIDENCE.glob(pattern))
    finally:
        v.shell('gnome-extensions enable lightos@lightos.dev')
        time.sleep(.4)
        v.evaluate(f'{SEARCH}.close(); Main.overview.dash.showAppsButton.checked=false; Main.overview.hide(); true')
        for key,value in original.items(): option(key,value)
        v.evaluate('global.context.unsafe_mode=false; true')
        report['shellEvalDisabled']=v.shell('gdbus call --session --dest org.gnome.Shell '
            '--object-path /org/gnome/Shell --method org.gnome.Shell.Eval "1+1"').startswith('(false,')
        REPORT.write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    assert report['shellEvalDisabled']
    print(json.dumps(report['checks'],indent=2),flush=True)


if __name__=='__main__':main()
