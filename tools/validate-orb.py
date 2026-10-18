#!/usr/bin/env python3
"""Validate the installed Orb in the isolated VM; requires VM-only Shell Eval.

Enable Eval temporarily through Looking Glass. Always restores desktop settings
and disables Eval. Clipboard fixture replaces only the VM clipboard contents.
"""
import ast
import json
import shlex
import subprocess
import time
from vm import ROOT, Monitor, ssh_args

ENV = 'export XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus; '
EXT = 'Main.extensionManager.lookup("lightos@lightos.dev").stateObj'


def shell(command):
    return subprocess.check_output(ssh_args() + [ENV + command], text=True).strip()


def evaluate(expression):
    result = shell('gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell '
                   '--method org.gnome.Shell.Eval ' + shlex.quote(expression))
    if not result.startswith('(true, '):
        raise RuntimeError(result)
    value = ast.literal_eval(result[7:-1])
    return json.loads(value) if value else None


def capture(name):
    time.sleep(.6)
    with Monitor() as monitor:
        monitor.call('screendump', filename=str(ROOT / 'docs/screenshots/gnome' / name), format='png')


def main():
    report = {'platform': shell('gnome-shell --version'), 'checks': {}}
    checks = report['checks']
    original = evaluate(f'({{motion:{EXT}._orb._motion, volume:{EXT}._orb._stream.volume, muted:{EXT}._orb._stream.is_muted}})')
    try:
        evaluate(f'Main.overview.hide(); Main.panel.statusArea.quickSettings.menu.close(); {EXT}._system.menu.close(); true')
        time.sleep(.6)
        padding = evaluate(f'(()=>{{const St=imports.gi.St; const sides=[St.Side.TOP,St.Side.RIGHT,St.Side.BOTTOM,St.Side.LEFT]; return {{orb:sides.map(s=>{EXT}._system.menu.box.get_theme_node().get_padding(s)),quick:sides.map(s=>Main.panel.statusArea.quickSettings.menu.box.get_theme_node().get_padding(s))}};}})()')
        assert padding['orb'] == padding['quick'], padding
        report['padding'] = padding
        checks['nativePadding'] = True
        evaluate(f'{EXT}._system.menu.open(); true')
        assert evaluate(f'{EXT}._orb._event') == 'menu'
        checks['menuSignal'] = True
        if original['motion']:
            deadline = time.monotonic() + 1
            peak = 0
            while time.monotonic() < deadline:
                peak = max(peak, evaluate(f'Math.max(...{EXT}._orb._motionState.particles().map(p=>p.wink))'))
                if peak > .5: break
                time.sleep(.025)
            assert peak > .5, peak
            checks['menuWink'] = True
        capture('orb-menu-padding.png')
        orb_x = evaluate(f'{EXT}._system.menu.actor.get_transformed_position()[0]')
        evaluate(f'{EXT}._system.menu.close(); Main.panel.statusArea.quickSettings.menu.open(); true')
        capture('orb-quick-settings-reference.png')
        edge = evaluate('(()=>{const a=Main.panel.statusArea.quickSettings.menu._boxPointer; return global.stage.width-a.get_transformed_position()[0]-a.width;})()')
        assert abs(orb_x - edge) < 1, (orb_x, edge)
        report['edgeInsets'] = {'left': orb_x, 'right': edge}
        checks['nativeEdgeInset'] = True
        evaluate('Main.panel.statusArea.quickSettings.menu.close(); true')
        # Use the actual shared mixer stream, never invoke react() directly.
        base = min(original['volume'], 40000)
        for value, expected in [(base, None), (base + 2000, 'louder'), (base, 'quieter')]:
            evaluate(f'{EXT}._orb._stream.volume={value}; {EXT}._orb._stream.push_volume(); true')
            time.sleep(.2)
            if expected:
                assert evaluate(f'{EXT}._orb._event') == expected, (expected, evaluate(f'({{event:{EXT}._orb._event,volume:{EXT}._orb._stream.volume}})'))
                checks[expected + 'Signal'] = True
                target = evaluate(f'{EXT}._orb._motionState._formTarget')
                assert target['lift'] < 0 if expected == 'louder' else target['lift'] > 0
                report.setdefault('nativeActionProfiles', {})[expected] = target
        evaluate(f'{EXT}._orb._stream.change_is_muted({str(not original["muted"]).lower()}); true')
        time.sleep(.2)
        assert evaluate(f'{EXT}._orb._event') == ('unmute' if original['muted'] else 'mute')
        checks['muteSignal'] = True
        evaluate('imports.gi.St.Clipboard.get_default().set_text(imports.gi.St.ClipboardType.CLIPBOARD,"LightOS Orb VM clipboard fixture"); true')
        time.sleep(.2)
        assert evaluate(f'{EXT}._orb._event') == 'copy'
        checks['clipboardOwnerSignal'] = True
        target = evaluate(f'{EXT}._orb._motionState._formTarget')
        assert target['merge'] > 0 and target['wave'] > 0
        report['nativeActionProfiles']['copy'] = target
        checks['nativeMorphProfiles'] = True
        evaluate(f'{EXT}._orb._settings.set_boolean("enable-animations",false); true')
        assert not evaluate(f'{EXT}._orb._timeline.is_playing()')
        assert not evaluate(f'{EXT}._orb._motion')
        checks['reducedMotion'] = True
        evaluate(f'{EXT}._orb._settings.set_boolean("enable-animations",true); true')
        assert evaluate(f'{EXT}._orb._timeline.is_playing()')
        checks['motionResumes'] = True
        evaluate(f'global._lightosOldOrb={EXT}._orb; true')
        shell('gnome-extensions disable lightos@lightos.dev')
        assert evaluate('global._lightosOldOrb._signals.length') == 0
        assert evaluate('global._lightosOldOrb._streamSignals.length') == 0
        assert not evaluate('global._lightosOldOrb._timeline.is_playing()')
        checks['disableCleanup'] = True
        shell('gnome-extensions enable lightos@lightos.dev')
        assert evaluate(f'!!{EXT}._orb._stream')
        checks['reenable'] = True
        evaluate(f'{EXT}._orb._settings.set_boolean("enable-animations",true); true')
        angle = evaluate(f'{EXT}._orb._motionState.rotation')
        time.sleep(1.1)
        assert evaluate(f'{EXT}._orb._motionState.rotation') > angle
        checks['continuousTimeline'] = True
        evaluate(f'global._lightosOldOrb={EXT}._orb; {EXT}._orb.actor.destroy(); true')
        assert evaluate('global._lightosOldOrb._signals.length') == 0
        assert evaluate('global._lightosOldOrb._streamSignals.length') == 0
        assert not evaluate('global._lightosOldOrb._timeline.is_playing()')
        checks['actorDestroyCleanup'] = True
        shell('gnome-extensions disable lightos@lightos.dev')
        shell('gnome-extensions enable lightos@lightos.dev')
        evaluate('delete global._lightosOldOrb; true')
    finally:
        shell('gnome-extensions enable lightos@lightos.dev')
        evaluate(f'{EXT}._orb._stream.volume={original["volume"]}; {EXT}._orb._stream.push_volume(); {EXT}._orb._stream.change_is_muted({str(original["muted"]).lower()}); {EXT}._orb._settings.set_boolean("enable-animations",{str(original["motion"]).lower()}); true')
        evaluate('global.context.unsafe_mode=false; true')
    report['shellEvalDisabled'] = shell('gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "1+1"').startswith('(false,')
    assert report['shellEvalDisabled']
    path = ROOT / 'docs/orb-validation.json'
    path.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
