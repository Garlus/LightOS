#!/usr/bin/env python3
"""Validate LightOS' compact system menu in the isolated GNOME VM.

Build/install/restart before running. Shell Eval is disabled in finally.
Screenshots show running actors; no desktop operation targets the host.
"""
import argparse
import importlib
import json
import time
from vm import ROOT

v = importlib.import_module('validate-search')
EXT = v.EXT
MENU = f'{EXT}._systemMenu'
REPORT = ROOT / 'docs/system-validation.json'


def evaluate(expression):
    return v.evaluate(expression)


def setting(key, value):
    method = 'set_boolean' if isinstance(value, bool) else 'set_string'
    evaluate(f'{EXT}._settings.{method}({json.dumps(key)},{json.dumps(value)}); true')
    time.sleep(.3)


def section(index):
    evaluate(f'{MENU}.button.menu.open(); {MENU}.button.menu._getMenuItems()[{index}].menu.open(); true')
    time.sleep(3)


def close_tools():
    titles = ['Aufräumen', 'App Updates', 'Homebrew', 'Deinstallierungsprogramm',
              'Text vom Bildschirm kopieren']
    evaluate('global.get_window_actors().filter(a=>' + json.dumps(titles) +
             '.includes(a.meta_window.title)).forEach(a=>a.meta_window.delete(global.get_current_time())); true')
    time.sleep(.4)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--enable-eval', action='store_true')
    args = parser.parse_args()
    if args.enable_eval:
        v.enable_eval()
    original = evaluate(f'Object.fromEntries(["appearance","color-engine","maximize-new-workspace"]'
                        f'.map(k=>[k,{EXT}._settings.get_value(k).deep_unpack()]))')
    report = {'platform': v.shell('gnome-shell --version'), 'checks': {}, 'evidence': []}
    checks = report['checks']
    try:
        evaluate(f'Main.overview.hide(); {EXT}._search.close(); true')
        close_tools()
        setting('color-engine', 't3')
        setting('appearance', 'light')
        geometry = evaluate(f'''(() => {{
            const button={MENU}.button, quick=Main.panel.statusArea.quickSettings;
            const children=quick.get_parent().get_children();
            return {{adjacent:children.indexOf(button)+1===children.indexOf(quick),
                nativeActivities:Main.panel.statusArea.activities.visible,
                panelHeight:Main.panel.height,
                quickType:quick.constructor.name,
                icon:button.get_first_child().icon_name}};
        }})()''')
        assert geometry['adjacent'] and geometry['nativeActivities'], geometry
        assert geometry['icon'] == 'computer-symbolic', geometry
        checks['nativePanelAndAdjacentIcon'] = geometry
        evaluate(f'{MENU}.button.menu.open(); true')
        time.sleep(3)
        v.capture('system-menu-light')
        section(0)
        data = evaluate(f'''({{cpu:{MENU}._rows.cpu.text,memory:{MENU}._rows.memory.text,
            temperature:{MENU}._rows.temperature.text,gpu:{MENU}._rows.gpu.text,
            history:{MENU}._history.get('cpu').values.length,
            fg:{MENU}._rows.cpu.get_theme_node().get_foreground_color().to_string(),
            rowWidth:{MENU}._rows.cpu.get_parent().width}})''')
        assert '%' in data['cpu'] and 'GiB' in data['memory'] and data['history'] > 0, data
        assert data['fg'].endswith('ff'), data
        checks['liveKernelCountersAndReadableRows'] = data
        v.capture('system-monitor-light')
        section(1)
        assert evaluate(f'{MENU}._volumes.numMenuItems') > 0
        v.capture('system-disks-light')
        section(2)
        network = evaluate(f'({{download:{MENU}._rows.download.text,ipv4:{MENU}._rows.ipv4.text}})')
        assert '/s' in network['download'] and '10.' in network['ipv4'], network
        checks['networkRatesAndIPv4'] = network
        v.capture('system-network-light')
        evaluate(f'{MENU}.button.menu.close(); true')
        assert evaluate(f'{MENU}._timer===0 && {MENU}._process===null')
        checks['closedMenuStopsSampling'] = True
        setting('appearance', 'dark')
        section(0)
        v.capture('system-monitor-dark')
        evaluate(f'{MENU}.button.menu.close(); true')
        setting('appearance', 'light')
        for mode, title in [('updates', 'App Updates'), ('cleanup', 'Aufräumen'),
                            ('brew', 'Homebrew'), ('uninstall', 'Deinstallierungsprogramm')]:
            close_tools()
            evaluate(f'{MENU}._launch({json.dumps(mode)}); true')
            time.sleep(3)
            assert title in evaluate('global.get_window_actors().map(a=>a.meta_window.title)'), title
            v.capture('system-' + {'updates': 'app-updates', 'brew': 'homebrew'}.get(mode, mode))
        checks['nativeUtilityWindows'] = True
        setting('maximize-new-workspace', True)
        evaluate('global._systemTestWindow=global.get_window_actors().map(a=>a.meta_window)'
                 '.find(w=>w.title==="Deinstallierungsprogramm"); '
                 'global._systemTestOrigin=global._systemTestWindow.get_workspace(); '
                 'global._systemTestWindow.activate(global.get_current_time()); '
                 'global._systemTestWindow.maximize(); true')
        time.sleep(1)
        moved = evaluate(f'''({{maximized:global._systemTestWindow.is_maximized(),
            different:global._systemTestWindow.get_workspace()!==global._systemTestOrigin,
            owned:{MENU}._workspace._windows.get(global._systemTestWindow).target===global._systemTestWindow.get_workspace()}})''')
        assert moved['maximized'] and moved['different'] and moved['owned'], moved
        v.capture('system-maximize-workspace')
        # Overview proves that this is an independent workspace, not fullscreen.
        evaluate('Main.overview.show(); true')
        v.capture('system-maximize-overview')
        evaluate('Main.overview.hide(); global._systemTestWindow.unmaximize(); true')
        time.sleep(1)
        assert evaluate('global._systemTestWindow.get_workspace()===global._systemTestOrigin')
        checks['maximizeMovesAndRestoreReturns'] = moved
        evaluate('global._systemTestWindow.maximize(); true')
        time.sleep(.8)
        setting('maximize-new-workspace', False)
        assert evaluate('global._systemTestWindow.get_workspace()===global._systemTestOrigin')
        checks['toggleOffRestoresOwnedWindow'] = True
        evaluate('global._systemTestWindow.unmaximize(); true')
        setting('maximize-new-workspace', True)
        evaluate('global._systemTestWindow.maximize(); true')
        time.sleep(.8)
        evaluate(f'global._oldSystemMenu={MENU}; true')
        v.shell('gnome-extensions disable lightos@lightos.dev')
        time.sleep(.6)
        assert evaluate('!Main.panel.statusArea["lightos-system"] && '
                        'global._oldSystemMenu._timer===0 && global._oldSystemMenu._workspace._windows.size===0')
        assert evaluate('global._systemTestWindow.get_workspace()===global._systemTestOrigin')
        checks['disableRemovesIndicatorSignalsAndRestoresWorkspace'] = True
        v.shell('gnome-extensions enable lightos@lightos.dev')
        time.sleep(.8)
        assert evaluate(f'!!{MENU}.button')
        checks['reenableSuccessful'] = True
        report['evidence'] = sorted('screenshots/gnome/' + p.name for p in
                                    v.EVIDENCE.glob('system-*.png') if 'initial' not in p.name)
    finally:
        v.shell('gnome-extensions enable lightos@lightos.dev')
        close_tools()
        evaluate(f'{MENU}.button.menu.close(); true')
        for key, value in original.items():
            setting(key, value)
        evaluate('delete global._systemTestWindow; delete global._systemTestOrigin; '
                 'delete global._oldSystemMenu; global.context.unsafe_mode=false; true')
        report['shellEvalDisabled'] = v.shell('gdbus call --session --dest org.gnome.Shell '
            '--object-path /org/gnome/Shell --method org.gnome.Shell.Eval "1+1"').startswith('(false,')
        REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    assert report['shellEvalDisabled']
    print(json.dumps(checks, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
