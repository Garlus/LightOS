#!/usr/bin/env python3
"""Validate the installed search in the isolated GNOME VM. Disables Shell Eval on exit.

Build, install and restart the VM session first. --enable-eval uses VM Looking
Glass via QMP, never the host desktop. Personal search state and color settings
are restored, including after a failed assertion.
"""
import argparse
import ast
import json
from pathlib import Path
import shlex
import subprocess
import time
from vm import ROOT, Monitor, ssh_args

EXT = 'Main.extensionManager.lookup("lightos@lightos.dev").stateObj'
SEARCH = f'{EXT}._search'
ENV = 'export XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus; '
REPORT = ROOT / 'docs/search-validation.json'
EVIDENCE = ROOT / 'docs/screenshots/gnome'


def shell(command):
    return subprocess.check_output(ssh_args() + [ENV + command], text=True).strip()


def evaluate(expression):
    result = shell('gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell '
                   '--method org.gnome.Shell.Eval ' + shlex.quote(expression))
    if not result.startswith('(true, '):
        raise RuntimeError(result)
    value = ast.literal_eval(result[7:-1])
    return json.loads(value) if value else None


def key(*keys):
    with Monitor() as monitor:
        monitor.call('send-key', keys=[dict(type='qcode', data=k) for k in keys])
    time.sleep(.25)


def capture(name):
    time.sleep(.6)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    with Monitor() as monitor:
        monitor.call('screendump', filename=str(EVIDENCE / f'{name}.png'), format='png')
    print(name, flush=True)


def query(text):
    evaluate(f'if (!{SEARCH}._dialog.visible) {SEARCH}.toggle(); '
             f'{SEARCH}._entry.set_text({json.dumps(text)}); true')
    time.sleep(.8)


def rows():
    return evaluate(f'{SEARCH}._rows.map(r=>({{id:r.id,name:r.result.name}}))')


def enable_eval():
    key('alt', 'f2')
    subprocess.run(['python3', str(ROOT / 'tools/vm.py'), 'type', 'lg'], check=True)
    key('ret')
    time.sleep(.6)
    subprocess.run(['python3', str(ROOT / 'tools/vm.py'), 'type', 'global.context.unsafe_mode=true'], check=True)
    key('ret')
    key('esc')
    time.sleep(.4)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--enable-eval', action='store_true')
    args = parser.parse_args()
    if args.enable_eval:
        enable_eval()
    original_state = evaluate(f'{SEARCH}._store.state')
    original_settings = evaluate(f'Object.fromEntries(["palette","appearance","color-engine"]'
                                 f'.map(k=>[k,{EXT}._settings.get_string(k)]))')
    report = {'date': time.strftime('%Y-%m-%d'), 'platform': shell('gnome-shell --version'),
              'version': evaluate(f'{EXT}.metadata.version'), 'checks': {}, 'evidence': []}
    checks = report['checks']
    try:
        assert report['version'] == 14
        evaluate(f'{SEARCH}.close(); {SEARCH}._store.state={{version:1,items:{{}},history:[]}}; true')
        query('firefx')
        assert rows()[0]['id'] == 'app:org.mozilla.firefox.desktop', rows()
        checks['fuzzyAppSearch'] = rows()
        geometry = evaluate(f'({{entryX:{SEARCH}._entry.get_transformed_position()[0],'
            f'entryWidth:{SEARCH}._entry.width,rowX:{SEARCH}._rows[0].button.get_transformed_position()[0],'
            f'rowWidth:{SEARCH}._rows[0].button.width,contentWidth:{SEARCH}._dialog.contentLayout.width,'
            f'titlePresent:!!{SEARCH}._title}})')
        assert abs(geometry['entryX'] - geometry['rowX']) <= 1, geometry
        assert abs(geometry['entryWidth'] - geometry['rowWidth']) <= 1, geometry
        assert geometry['contentWidth'] == 480 and not geometry['titlePresent'], geometry
        checks['compactEqualWidthLayout'] = geometry
        assert evaluate(f'!{SEARCH}._dialog._lightbox && {SEARCH}._dialog._hasModal')
        checks['noVignetteWithModalGrab'] = True
        capture('oma-search-apps')
        key('ctrl', 'k')
        assert evaluate(f'{SEARCH}._mode') == 'actions'
        capture('oma-search-actions')
        key('down'); key('down'); key('ret')
        assert evaluate(f'{SEARCH}._store.state.items["app:org.mozilla.firefox.desktop"].favorite')
        checks['favoriteKeyboardAction'] = True
        key('ctrl', 'k')
        key('down'); key('down'); key('down'); key('ret')
        assert evaluate(f'{SEARCH}._mode') == 'alias'
        subprocess.run(['python3', str(ROOT / 'tools/vm.py'), 'type', 'fx'], check=True)
        capture('oma-search-alias')
        key('ret')
        query('fx')
        assert rows()[0]['id'] == 'app:org.mozilla.firefox.desktop', rows()
        assert evaluate(f'{SEARCH}._store.state.items["app:org.mozilla.firefox.desktop"].alias') == 'fx'
        checks['aliasKeyboardEditAndRanking'] = True
        capture('oma-search-favorite')
        key('ctrl', 'k')
        for _ in range(4): key('down')
        key('ret')
        assert not any(r['id'] == 'app:org.mozilla.firefox.desktop' for r in rows()), rows()
        query('Ausgeblendete Treffer')
        assert rows()[0]['id'] == 'command:unhide', rows()
        key('ret')
        query('fx')
        assert rows()[0]['id'] == 'app:org.mozilla.firefox.desktop', rows()
        checks['hideAndRestore'] = True
        # Native action activation and history, without starting a third-party app.
        query('Helle Darstellung')
        assert rows()[0]['id'] == 'command:appearance:light', rows()
        key('ctrl', '1')
        assert not evaluate(f'{SEARCH}._dialog.visible')
        assert evaluate(f'{EXT}._settings.get_string("appearance")') == 'light'
        query('')
        key('up')
        assert evaluate(f'{SEARCH}._entry.get_text()') == 'helle darstellung'
        checks['quickPickAndHistory'] = True
        query('Farbpalette')
        assert len([r for r in rows() if r['id'].startswith('command:palette:')]) == 5, rows()
        capture('oma-search-commands')
        query('Grove')
        assert rows()[0]['id'] == 'command:palette:grove', rows()
        key('ret')
        assert evaluate(f'{EXT}._settings.get_string("palette")') == 'grove'
        assert evaluate(f'{EXT}._settings.get_string("color-engine")') == 't3'
        checks['paletteCommandApplied'] = True
        evaluate(f'{EXT}._settings.set_string("palette","ocean"); true')
        query('12 * (3 + 4)')
        assert rows()[0]['name'] == '= 84', rows()
        capture('oma-search-calculator')
        key('ret')
        assert not evaluate(f'{SEARCH}._dialog.visible')
        assert '12 * (3 + 4)' not in evaluate(f'JSON.stringify({SEARCH}._store.state)')
        checks['calculatorAndPrivateHistory'] = True
        query('Willkommen')
        assert any(r['id'] != 'web' for r in rows()), rows()
        checks['fileAndProviderSearch'] = rows()
        capture('oma-search-files')
        query('zzqv-no-result-846291')
        assert any(r['id'] == 'web' for r in rows()), rows()
        capture('oma-search-web')
        checks['explicitWebFallback'] = True
        # Inject a slow provider: it must not overwrite the action menu after cancellation.
        evaluate(f'{SEARCH}._providers=[{{id:"test-delayed",appInfo:{{get_name:()=>"Test"}},'
                 'getInitialResultSet:()=>new Promise(resolve=>imports.gi.GLib.timeout_add(0,2000,()=>{resolve(["late"]);return false;})), '
                 'getResultMetas:async()=>[{id:"late",name:"Late result"}]}]; true')
        query('firefx')
        key('ctrl', 'k')
        time.sleep(2.1)
        assert evaluate(f'{SEARCH}._mode') == 'actions'
        assert not any('test-delayed' in r['id'] for r in rows()), rows()
        checks['lateProviderCannotReplaceActions'] = True
        key('esc'); key('esc')
        evaluate(f'{EXT}._settings.set_string("appearance","dark"); true')
        query('firefx')
        capture('oma-search-dark')
        evaluate(f'{SEARCH}.close(); global._lightosSearchTest={SEARCH}; true')
        shell('gnome-extensions disable lightos@lightos.dev')
        time.sleep(.4)
        assert evaluate('global._lightosSearchTest._dialog===null && global._lightosSearchTest._timeout===0')
        checks['disableDestroysDialogAndTimer'] = True
        shell('gnome-extensions enable lightos@lightos.dev')
        time.sleep(.6)
        assert evaluate(f'{SEARCH}._store.state.items["app:org.mozilla.firefox.desktop"].alias') == 'fx'
        checks['personalizationSurvivesReload'] = True
        assert evaluate('Main.panel.statusArea.activities.visible')
        assert evaluate('!!Main.panel.statusArea["lightos-system"] && !Main.panel.statusArea["lightos-active-app"]')
        checks['nativePanelUnchanged'] = True
        report['evidence'] = sorted(str(p.relative_to(ROOT / 'docs')) for p in EVIDENCE.glob('oma-search-*.png'))
    finally:
        shell('gnome-extensions enable lightos@lightos.dev')
        evaluate(f'{SEARCH}.close(); {SEARCH}._store.state={json.dumps(original_state)}; {SEARCH}._store.save(); true')
        for name, value in original_settings.items():
            evaluate(f'{EXT}._settings.set_string({json.dumps(name)},{json.dumps(value)}); true')
        evaluate('delete global._lightosSearchTest; global.context.unsafe_mode=false; true')
        report['shellEvalDisabled'] = shell('gdbus call --session --dest org.gnome.Shell '
            '--object-path /org/gnome/Shell --method org.gnome.Shell.Eval "1+1"').startswith('(false,')
        REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    assert report['shellEvalDisabled']
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
