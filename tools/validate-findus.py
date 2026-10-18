#!/usr/bin/env python3
"""Validate the installed migration in the isolated VM with temporary Shell Eval.

Enable Eval through VM Looking Glass before running. All test preferences and
font overrides are restored; the final operation disables Shell Eval.
"""
import ast
import json
import shlex
import subprocess
import time

from vm import ROOT, Monitor, ssh_args

ENV = 'export XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus; '
EXT = 'Main.extensionManager.lookup("lightos@lightos.dev").stateObj'
KEYS = ['font-rendering', 'font-antialiasing', 'font-hinting']


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
    time.sleep(.35)
    path = ROOT / 'docs/screenshots/gnome' / name
    with Monitor() as monitor:
        monitor.call('screendump', filename=str(path), format='png')


def vm_key(*keys):
    subprocess.run(['python3', str(ROOT / 'tools/vm.py'), 'key', *keys], check=True)


def fonts():
    return evaluate('(()=>{const s=new imports.gi.Gio.Settings({schema_id:"org.gnome.desktop.interface"});'
                    f'return Object.fromEntries({json.dumps(KEYS)}.map(k=>[k,{{value:s.get_string(k),user:s.get_user_value(k)?.deep_unpack()??null}}]));' + '})()')


def set_option(key, value):
    evaluate(f'{EXT}._settings.set_boolean({json.dumps(key)},{str(value).lower()}); true')


def assert_centered():
    time.sleep(.5)
    geometry = evaluate('(()=>{const w=global._lightosCenterTest;const f=w.get_frame_rect();'
                        'const a=w.get_work_area_current_monitor();return {frame:{x:f.x,y:f.y,width:f.width,height:f.height},'
                        'area:{x:a.x,y:a.y,width:a.width,height:a.height},maximized:w.maximized_horizontally||w.maximized_vertically};})()')
    frame, area = geometry['frame'], geometry['area']
    assert not geometry['maximized'], geometry
    assert abs(frame['x'] - (area['x'] + max(0, int((area['width'] - frame['width']) / 2 + .5)))) <= 1, geometry
    assert abs(frame['y'] - (area['y'] + max(0, int((area['height'] - frame['height']) / 2 + .5)))) <= 1, geometry
    return geometry


def main():
    report = {'platform': shell('gnome-shell --version'), 'checks': {}}
    checks = report['checks']
    original_fonts = fonts()
    original = evaluate(f'({{font:{EXT}._settings.get_boolean("font-smoothing-enabled"),press:{EXT}._settings.get_boolean("press-animations-enabled"),motion:{EXT}._interface.get_boolean("enable-animations"),force:global.force_animations}})')
    report['initialOptions'] = original
    try:
        # GNOME suppresses animations on the VM's software renderer. This
        # temporary Shell test flag is never used by the shipped extension.
        evaluate('global.force_animations=true;Main.overview.hide();true')
        report['softwareRendererAnimationTestFlag'] = True
        set_option('font-smoothing-enabled', False)
        set_option('press-animations-enabled', False)
        assert not evaluate(f'!!{EXT}._pressAnimations._captureId')
        checks['optionsDisabledByDefault'] = not original['font'] and not original['press']
        baseline = fonts()
        set_option('font-smoothing-enabled', True)
        preset = fonts()
        assert [preset[k]['value'] for k in KEYS] == ['manual', 'grayscale', 'none'], preset
        checks['fontPresetApplied'] = True
        set_option('font-smoothing-enabled', False)
        assert fonts() == baseline, (fonts(), baseline)
        checks['fontValuesAndDefaultOverridesRestored'] = True
        set_option('font-smoothing-enabled', True)
        evaluate(f'{EXT}._interface.set_string("font-hinting","slight"); true')
        set_option('font-smoothing-enabled', False)
        assert fonts()['font-hinting']['user'] == 'slight'
        checks['externalFontChangePreserved'] = True
        # Restore our external-change fixture before the next lifecycle check.
        value = baseline['font-hinting']['user']
        evaluate(f'{EXT}._interface.' + ('reset("font-hinting")' if value is None else f'set_string("font-hinting",{json.dumps(value)})') + '; true')

        shell('gnome-text-editor --new-window >/tmp/lightos-centering.log 2>&1 &')
        time.sleep(1.5)
        evaluate('global._lightosCenterTest=global.get_window_actors().map(a=>a.meta_window).find(w=>w.get_wm_class()==="org.gnome.TextEditor");'
                 'global._lightosCenterTest.unmaximize(); true')
        time.sleep(.3)
        evaluate('global._lightosCenterTest.move_resize_frame(true,60,80,680,450);global._lightosCenterTest.activate(global.get_current_time());true')
        capture('findus-window-before.png')
        vm_key('ctrl', 'super', 'c')
        report['shortcutGeometry'] = assert_centered()
        capture('findus-window-centered.png')
        checks['actualShortcutCentersWindow'] = True
        evaluate('global._lightosCenterTest.maximize(); true')
        time.sleep(.4)
        vm_key('ctrl', 'super', 'c')
        report['restoredGeometry'] = assert_centered()
        checks['waylandUnmaximizeCentersRestoredFrame'] = True
        evaluate(f'{EXT}._activeApp.menu.open(); true')
        capture('findus-app-menu.png')
        evaluate(f'{EXT}._activeApp.menu.close();{EXT}._system.menu.open();true')
        report['systemActions'] = evaluate(f'{EXT}._systemActions.map(a=>({{label:a.item.label.text,capability:a.capability,available:{EXT}._actions[a.capability],sensitive:a.item.sensitive}}))')
        assert len(report['systemActions']) == 6
        assert all(a['available'] == a['sensitive'] for a in report['systemActions'])
        checks['nativeActionCapabilities'] = True
        capture('findus-system-menu.png')
        # Dispatch every system action against a temporary method spy, never
        # suspend or log out the VM during this controller wiring check.
        methods = ['activateLockScreen', 'activateSuspend', 'activateSwitchUser', 'activateLogout', 'activateRestart', 'activatePowerOff']
        for index, method in enumerate(methods):
            result = evaluate(f'(()=>{{const e={EXT};const a=e._actions;const old=a.{method};let called=false;'
                              f'try{{a.{method}=()=>{{called=true;}};e._systemActions[{index}].item.activate(null);'
                              f'return {{called,available:a[e._systemActions[{index}].capability]}};}}finally{{a.{method}=old;}}}})()')
            assert result['called'] == result['available'], (method, result)
        checks['systemActionDispatchAndUnavailableGuards'] = True
        evaluate(f'{EXT}._system.menu.open();{EXT}._system.menu._getMenuItems().find(i=>i.label?.text==="Bildschirmfoto …").activate(null);true')
        time.sleep(.6)
        assert evaluate('Main.screenshotUI.visible')
        capture('findus-screenshot-ui.png')
        vm_key('esc')
        checks['nativeScreenshotUIOpens'] = True

        set_option('press-animations-enabled', True)
        evaluate(f'{EXT}._interface.set_boolean("enable-animations",true);true')
        assert evaluate(f'!!{EXT}._pressAnimations._captureId')
        # Send a real VM input event and observe the production actor transform.
        point = evaluate(f'(()=>{{const a={EXT}._system;const [x,y]=a.get_transformed_position();return {{x:x+a.width/2,y:y+a.height/2}};}})()')
        with Monitor() as monitor:
            monitor.call('input-send-event', events=[{'type': 'abs', 'data': {'axis': 'x', 'value': round(point['x'] * 32767 / 1279)}}, {'type': 'abs', 'data': {'axis': 'y', 'value': round(point['y'] * 32767 / 799)}}])
            monitor.call('input-send-event', events=[{'type': 'btn', 'data': {'button': 'left', 'down': True}}])
            active = evaluate(f'{EXT}._pressAnimations._actors.size')
            monitor.call('input-send-event', events=[{'type': 'btn', 'data': {'button': 'left', 'down': False}}])
        assert active > 0, 'Panel press did not start an animation'
        time.sleep(.5)
        assert evaluate(f'{EXT}._pressAnimations._actors.size') == 0
        checks['realPointerPressAndTransformCleanup'] = True
        evaluate(f'{EXT}._interface.set_boolean("enable-animations",false);true')
        assert not evaluate(f'!!{EXT}._pressAnimations._captureId')
        assert evaluate(f'{EXT}._pressAnimations._actors.size') == 0
        checks['reducedMotionStopsCaptureAndTransforms'] = True
        evaluate(f'{EXT}._interface.set_boolean("enable-animations",true);{EXT}._system.menu.close();true')
        set_option('font-smoothing-enabled', True)
        evaluate(f'global._lightosMigrationOld={{centering:{EXT}._centering,press:{EXT}._pressAnimations,font:{EXT}._fontRendering}};true')
        shell('gnome-extensions disable lightos@lightos.dev')
        assert fonts() == baseline
        state = evaluate('({center:global._lightosMigrationOld.centering._destroyed,press:global._lightosMigrationOld.press._destroyed,font:global._lightosMigrationOld.font._destroyed,capture:global._lightosMigrationOld.press._captureId,actors:global._lightosMigrationOld.press._actors.size})')
        assert state == {'center': True, 'press': True, 'font': True, 'capture': 0, 'actors': 0}, state
        checks['extensionDisableRestoresFontsAndDisposesControllers'] = True
        shell('gnome-extensions enable lightos@lightos.dev')
        assert fonts()['font-hinting']['value'] == 'none'
        assert evaluate(f'!!{EXT}._pressAnimations._captureId')
        checks['reenableAppliesUserOptions'] = True
        set_option('font-smoothing-enabled', False)
        set_option('press-animations-enabled', False)
        shell('gnome-extensions prefs lightos@lightos.dev >/tmp/lightos-prefs.log 2>&1 &')
        time.sleep(1.5)
        report['animationEvidence'] = 'docs/videos/findus-press-feedback.gif'
        report['checksComplete'] = True
    finally:
        shell('gnome-extensions enable lightos@lightos.dev')
        set_option('font-smoothing-enabled', False)
        for key, entry in original_fonts.items():
            command = f'{EXT}._interface.' + (f'reset({json.dumps(key)})' if entry['user'] is None else f'set_string({json.dumps(key)},{json.dumps(entry["user"])})')
            evaluate(command + ';true')
        set_option('font-smoothing-enabled', original['font'])
        set_option('press-animations-enabled', original['press'])
        evaluate(f'{EXT}._interface.set_boolean("enable-animations",{str(original["motion"]).lower()});global.force_animations={str(original["force"]).lower()};delete global._lightosCenterTest;delete global._lightosMigrationOld;global.context.unsafe_mode=false;true')
    report['shellEvalDisabled'] = shell('gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "1+1"').startswith('(false,')
    assert report['shellEvalDisabled']
    (ROOT / 'docs/findus-validation.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
