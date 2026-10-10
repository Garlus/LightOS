#!/usr/bin/env python3
"""VM-only solar transition checks using a test clock; always disable Shell Eval."""
import ast
import json
import shlex
import subprocess
import time
from vm import ROOT, Monitor, ssh_args

EXT='Main.extensionManager.lookup("lightos@lightos.dev").stateObj'
ENV='export XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus; '

def shell(command):
    return subprocess.check_output(ssh_args()+[ENV+command],text=True).strip()

def evaluate(expression):
    raw=shell('gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval '+shlex.quote(expression))
    if not raw.startswith('(true, '): raise RuntimeError(raw)
    result=ast.literal_eval(raw[7:-1])
    return json.loads(result) if result else None

def status():
    return evaluate(f'JSON.parse({EXT}._settings.get_string("solar-status"))')

def clock(hour=None,epoch=None,zone='Europe/Berlin'):
    expression=f'GLib.DateTime.new_from_unix_utc({int(epoch)}).to_timezone(tz)' if epoch is not None else f'GLib.DateTime.new(tz,2026,10,10,{hour},0,0)'
    evaluate(f'(()=>{{const GLib=imports.gi.GLib; const tz=GLib.TimeZone.new_identifier({json.dumps(zone)}); const solar={EXT}._solar; solar._clock=()=>{expression}; solar.refresh(); return true;}})()')

def capture(name,prefs=False):
    if prefs:
        shell('gnome-extensions prefs lightos@lightos.dev')
        time.sleep(1)
    time.sleep(.4)
    with Monitor() as monitor:
        monitor.call('screendump',filename=str(ROOT/'docs/screenshots/gnome'/f'{name}.png'),format='png')
    print(name,flush=True)

def close_prefs():
    # The extension prefs reuse an application process. Restart only that VM app
    # so its user GTK stylesheet is loaded from the current palette snapshot.
    shell("pkill -f '/usr/share/gnome-shell/org.gnome.Shell.Extensions$' || true")
    time.sleep(.5)

def main():
    report={'version':8,'platform':shell('gnome-shell --version'),'automatedChecks':940,'checks':{},
            'clock':'2026-10-10, injected only into the VM scheduler; system clock unchanged',
            'location':'VM has no GPS hardware; actual timezone fallback, synthetic location branch'}
    try:
        evaluate(f'{EXT}._settings.set_boolean("auto-appearance",true)')
        clock(0)
        sunrise=evaluate(f'{EXT}._solar._snapshot.next')/1000
        clock(epoch=sunrise-2)
        assert status()['mode']=='dark'
        clock(epoch=sunrise+2)
        assert status()['mode']=='light'
        assert evaluate(f'{EXT}._interface.get_string("color-scheme")')=='prefer-light'
        report['checks']['sunriseSwitchesLight']=True
        report['sunrise']=status()['sunrise']; report['sunset']=status()['sunset']
        capture('solar-sunrise-light')
        sunset=evaluate(f'{EXT}._solar._snapshot.next')/1000
        clock(epoch=sunset-2); assert status()['mode']=='light'
        clock(epoch=sunset+2); assert status()['mode']=='dark'
        assert evaluate(f'{EXT}._interface.get_string("color-scheme")')=='prefer-dark'
        report['checks']['sunsetSwitchesDark']=True
        close_prefs(); capture('solar-sunset-dark',prefs=True)
        evaluate('Main.panel.statusArea.quickSettings.menu.open()'); capture('solar-dark-quick-settings')
        evaluate('Main.panel.statusArea.quickSettings.menu.close()')
        # GNOME's own switch changes the interface; LightOS must honor it until sunrise.
        evaluate(f'{EXT}._interface.set_string("color-scheme","prefer-light")')
        assert status()['manual'] and status()['mode']=='light'
        clock(epoch=sunset+600); assert status()['manual'] and status()['mode']=='light'
        report['checks']['nativeManualOverride']=True
        close_prefs(); capture('solar-manual-override',prefs=True)
        clock(epoch=sunrise+86400+600)
        assert not status()['manual'] and status()['mode']=='light'
        clock(epoch=sunset+86400+600); assert status()['mode']=='dark'
        report['checks']['nextSunriseReleasesOverride']=True
        clock(12,zone='America/New_York')
        assert 'America/New_York' in status()['source'] and status()['mode']=='light'
        report['checks']['timezoneChangeRecalculates']=True
        clock(12)
        evaluate(f'{EXT}._solar._acceptLocation({{latitude:35.68,longitude:139.69,accuracy:10}})')
        assert 'Systemstandort' in status()['source'] and status()['mode']=='dark'
        report['checks']['syntheticLocationOverridesTimezone']=True
        close_prefs(); capture('solar-location-fixture',prefs=True)
        evaluate(f'{EXT}._solar._acceptLocation({{latitude:NaN,longitude:0,accuracy:0}})')
        assert 'Zeitzonenschätzung' in status()['source'] and status()['mode']=='light'
        report['checks']['invalidFixFallsBack']=True
        evaluate(f'{EXT}._settings.set_string("color-engine","chromaleon")')
        clock(23); assert status()['mode']=='dark'
        close_prefs(); capture('solar-chromaleon-night',prefs=True)
        clock(12); assert status()['mode']=='light'
        report['checks']['chromaEngineFollowsSchedule']=True
        evaluate(f'{EXT}._settings.set_string("color-engine","t3")')
        evaluate(f'{EXT}._settings.set_string("appearance","system")')
        assert not evaluate(f'{EXT}._settings.get_boolean("auto-appearance")')
        assert evaluate(f'{EXT}._solar._timer')==0
        report['checks']['systemChoiceStopsAutomation']=True
        evaluate(f'{EXT}._settings.set_boolean("auto-appearance",true)')
        clock(23)
        saved=evaluate(f'{EXT}._interfaceBackup["color-scheme"]')
        evaluate('global._lightosSolarTest = '+EXT+'._solar; true')
        shell('gnome-extensions disable lightos@lightos.dev')
        restored=shell('gsettings get org.gnome.desktop.interface color-scheme').strip("'")
        assert restored==saved['original'],(restored,saved)
        assert evaluate('global._lightosSolarTest._timer')==0
        assert not evaluate('global._lightosSolarTest._active')
        assert evaluate('global._lightosSolarTest._geoTimeout')==0
        report['checks']['disableStopsAndRestores']=True
        shell('gnome-extensions enable lightos@lightos.dev')
        assert status()['enabled']
        report['checks']['enableRecomputesActualTime']=True
    finally:
        try:
            shell('gnome-extensions enable lightos@lightos.dev')
            evaluate(f'{EXT}._settings.set_string("palette","ocean"); {EXT}._settings.set_string("color-engine","t3"); {EXT}._settings.set_boolean("auto-appearance",true); {EXT}._solar._clock=()=>imports.gi.GLib.DateTime.new_now_local(); {EXT}._solar._override=null; {EXT}._solar.refresh(); delete global._lightosSolarTest; true')
            evaluate('global.context.unsafe_mode=false')
        finally:
            (ROOT/'docs/solar-validation.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps(report['checks'],indent=2))

if __name__=='__main__': main()
