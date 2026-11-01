#!/usr/bin/env python3
"""Audit font profiles in the installed GNOME VM; requires temporary Shell Eval.

Build, install and restart the VM session first. Enable Eval in VM Looking Glass.
Profile and extension state are restored; Eval is disabled on completion.
Screenshots of the actual preferences and terminal are captured separately through
vm.py after exercising the native Adwaita / Geist selector with mouse input.
"""
import ast
import json
import shlex
import subprocess
import time

from vm import ROOT, ssh_args

ENV = 'export XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus; '
EXT = 'Main.extensionManager.lookup("lightos@lightos.dev").stateObj'
KEYS = ['font-name', 'document-font-name', 'monospace-font-name']


def shell(command):
    return subprocess.check_output(ssh_args() + [ENV + command], text=True).strip()


def evaluate(expression):
    result = shell('gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell '
                   '--method org.gnome.Shell.Eval ' + shlex.quote(expression))
    if not result.startswith('(true, '):
        raise RuntimeError(result)
    value = ast.literal_eval(result[7:-1])
    return json.loads(value) if value else None


def fonts(user=False):
    method = 'get_user_value(k)?.deep_unpack() ?? null' if user else 'get_string(k)'
    return evaluate('Object.fromEntries(' + json.dumps(KEYS) +
                    f'.map(k=>[k,new imports.gi.Gio.Settings({{schema_id:"org.gnome.desktop.interface"}}).{method}]))')


def select(profile):
    evaluate(f'{EXT}._settings.set_string("font-profile",{json.dumps(profile)}); true')
    time.sleep(.3)


def main():
    report = {'platform': shell('gnome-shell --version'), 'checks': {}}
    checks = report['checks']
    original = evaluate(f'{EXT}._settings.get_string("font-profile")')
    palette = evaluate(f'{EXT}._settings.get_string("palette")')
    smoothing = evaluate(f'{EXT}._settings.get_boolean("font-smoothing-enabled")')
    baseline = json.loads(shell('cat ~/.local/state/lightos-gnome/font-profile-backup.json'))
    expected_original = {key: baseline['keys'][key]['original'] for key in KEYS}
    try:
        assert evaluate(f'{EXT}._settings.get_default_value("font-profile").deep_unpack()') == 'geist'
        checks['defaultGeist'] = True
        initial = fonts()
        for profile, families in [('adwaita', ['Adwaita Sans', 'Adwaita Sans', 'Adwaita Mono']),
                                  ('geist', ['Geist', 'Geist', 'Geist Mono'])]:
            select(profile)
            current = fonts()
            for key, family in zip(KEYS, families):
                assert current[key] == initial[key].replace(
                    evaluate(f'imports.gi.Pango.FontDescription.from_string({json.dumps(initial[key])}).get_family()'), family, 1)
            report[profile] = {'settings': current,
                'shell': evaluate('imports.gi.St.Settings.get().font_name'),
                'clock': evaluate('Main.panel.statusArea.dateMenu._clockDisplay.get_theme_node().get_font().to_string()')}
            assert report[profile]['shell'] == current['font-name']
            checks[profile + 'RuntimeSwitch'] = True
        report['fontconfig'] = {family: shell('fc-match -f "%{family}" ' + shlex.quote(family))
                                for family in ['Geist', 'Geist Mono']}
        assert report['fontconfig'] == {'Geist': 'Geist', 'Geist Mono': 'Geist Mono'}
        checks['bundledFontsResolved'] = True
        assert evaluate(f'{EXT}._settings.get_string("palette")') == palette
        assert evaluate(f'{EXT}._settings.get_boolean("font-smoothing-enabled")') == smoothing
        checks['paletteAndSmoothingIndependent'] = True
        shell('gnome-extensions disable lightos@lightos.dev')
        time.sleep(.3)
        report['restoredUserValues'] = fonts(user=True)
        assert report['restoredUserValues'] == expected_original
        assert shell('test ! -L ~/.local/share/fonts/lightos-geist && echo removed') == 'removed'
        checks['disableRestoresOriginalsAndFontRegistration'] = True
        shell('gnome-extensions enable lightos@lightos.dev')
        time.sleep(.3)
        assert fonts() == report['geist']['settings']
        checks['reenableGeist'] = True
    finally:
        shell('gnome-extensions enable lightos@lightos.dev')
        select(original)
        evaluate('global.context.unsafe_mode=false; true')
    report['shellEvalDisabled'] = shell('gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell '
                                       '--method org.gnome.Shell.Eval "1+1"').startswith('(false,')
    assert report['shellEvalDisabled']
    (ROOT / 'docs/font-validation.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
