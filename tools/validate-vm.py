#!/usr/bin/env python3
"""Capture real GNOME VM evidence. Shell Eval is enabled only inside this VM."""
import ast
import json
from pathlib import Path
import shlex
import subprocess
import time
from vm import ROOT, Monitor, ssh_args

EVIDENCE = ROOT / 'docs/screenshots/gnome'
REPORT = ROOT / 'docs/gnome-validation.json'
EXTENSION = 'Main.extensionManager.lookup("lightos@lightos.dev").stateObj'
ENV = 'export XDG_SESSION_TYPE=wayland WAYLAND_DISPLAY=wayland-0 XDG_CURRENT_DESKTOP=GNOME; '


def shell(command):
    return subprocess.check_output(ssh_args() + [ENV + command], text=True).strip()


def evaluate(expression):
    result = shell('gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell '
                   '--method org.gnome.Shell.Eval ' + shlex.quote(expression))
    if not result.startswith('(true, '):
        raise RuntimeError(result)
    data = ast.literal_eval(result[7:-1])
    return json.loads(data) if data else None


def capture(name):
    time.sleep(.6)
    path = EVIDENCE / f'{name}.png'
    path.parent.mkdir(parents=True, exist_ok=True)
    with Monitor() as monitor:
        monitor.call('screendump', filename=str(path), format='png')
    print(name, flush=True)


def set_option(key, value):
    evaluate(f'{EXTENSION}._settings.set_string({json.dumps(key)}, {json.dumps(value)})')
    time.sleep(.4)


def launch_apps():
    shell('nautilus -q; pkill -TERM -f "^gnome-text-editor" || true; '
          'pkill -TERM -f "^/usr/libexec/gnome-terminal-server" || true; pkill -x ptyxis || true')
    time.sleep(.4)
    shell('nautilus ~/Documents/LightOS >/tmp/nautilus-lightos.log 2>&1 & '
          'gnome-text-editor ~/Documents/LightOS/Willkommen.md >/tmp/editor-lightos.log 2>&1 & '
          'ptyxis --new-window -T "Terminal · GTK4" --working-directory="$HOME/Documents/LightOS" -- bash --norc '
          '-c \'gnome-shell --version; ls -lh --color=auto; exec bash --norc\' '
          '>/tmp/terminal-lightos.log 2>&1 &')
    time.sleep(2.2)
    evaluate('global.get_window_actors().forEach(actor => { const w = actor.meta_window; '
             'const id = w.get_wm_class(); if (id === "org.gnome.Nautilus") w.move_resize_frame(true, 32, 76, 740, 622); '
             'if (id === "org.gnome.TextEditor") w.move_resize_frame(true, 700, 100, 548, 348); '
             'if (id === "org.gnome.Ptyxis") w.move_resize_frame(true, 700, 472, 548, 280); '
             'if (!["org.gnome.Nautilus","org.gnome.TextEditor","org.gnome.Ptyxis"].includes(id)) w.minimize(); });')
    # Ptyxis acknowledges its terminal grid size asynchronously; place after that commit.
    time.sleep(.5)
    evaluate('global.get_window_actors().find(a => a.meta_window.get_wm_class() === "org.gnome.Ptyxis")'
             '?.meta_window.move_frame(true, 700, 472)')
    evaluate('global.get_window_actors().find(a => a.meta_window.get_wm_class() === "org.gnome.TextEditor")'
             '?.meta_window.activate(global.get_current_time())')
    evaluate('global.get_window_actors().find(a => a.meta_window.get_wm_class() === "org.gnome.Ptyxis")'
             '?.meta_window.activate(global.get_current_time())')
    evaluate('global.get_window_actors().find(a => a.meta_window.get_wm_class() === "org.gnome.TextEditor")'
             '?.meta_window.activate(global.get_current_time())')


def geometry():
    raw = shell('python3 ~/LightOS-GNOME-project/tests/gnome-geometry.py 2>/tmp/geometry.log')
    return json.loads(raw.splitlines()[-1])


def main():
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    report = {'platform': shell('gnome-shell --version'), 'palettes': {}, 'checks': {}}
    # The VM is already in developer mode via Looking Glass, never the host.
    shell('gnome-extensions disable lightos@lightos.dev')
    time.sleep(.5)
    report['geometryBaseline'] = geometry()
    launch_apps()
    capture('before')
    shell('gnome-extensions enable lightos@lightos.dev')
    time.sleep(.5)
    for mode in ['light', 'dark']:
        set_option('appearance', mode)
        if mode == 'dark':
            # Compare themes within the same native appearance.
            shell('gnome-extensions disable lightos@lightos.dev; gsettings set org.gnome.desktop.interface color-scheme prefer-dark')
            time.sleep(.3)
            report['geometryBaselineDark'] = geometry()
            shell('gnome-extensions enable lightos@lightos.dev')
            time.sleep(.3)
        for palette in ['ocean', 'grove', 'ember', 'iris', 't3-chat', 't3-code']:
            set_option('palette', palette)
            launch_apps()
            key = f'{palette}-{mode}'
            capture(key)
            report['palettes'][key] = {
                'gtkAccent': shell("sed -n 's/^@define-color accent_bg_color //p' ~/.config/gtk-4.0/gtk.css"),
                'editorScheme': shell('gsettings get org.gnome.TextEditor style-scheme'),
                'geometry': geometry(),
            }
            baseline = report['geometryBaselineDark'] if mode == 'dark' else report['geometryBaseline']
            assert report['palettes'][key]['geometry'] == baseline, f'Geometry changed: {key}'
            REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    set_option('palette', 'ocean')
    set_option('appearance', 'light')
    launch_apps()
    capture('desktop')
    evaluate(f'{EXTENSION}._system.menu.open()')
    capture('system-menu')
    evaluate(f'{EXTENSION}._system.menu.close()')
    evaluate(f'{EXTENSION}._system.menu.open(); {EXTENSION}._system.menu._getMenuItems()'
             '.find(i=>i.label?.text === "Farbpalette").menu.open()')
    capture('palette-menu')
    evaluate(f'{EXTENSION}._system.menu.close()')
    evaluate('Main.panel.statusArea.quickSettings.menu.open()')
    capture('quick-settings')
    evaluate('Main.panel.statusArea.quickSettings.menu.close()')
    evaluate('Main.panel.statusArea.dateMenu.menu.open()')
    capture('calendar')
    evaluate('Main.panel.statusArea.dateMenu.menu.close()')
    for query, name in [('12 * (3 + 4)', 'search-calculator'), ('Willkommen', 'search-files'),
                        ('display', 'search-settings'), ('Files', 'search-apps')]:
        evaluate(f'{EXTENSION}._search.toggle(); {EXTENSION}._search._entry.set_text({json.dumps(query)})')
        time.sleep(1.4)
        rows = evaluate(f'{EXTENSION}._search._rows.map(r=>({{id:r.id,label:r.button.accessible_name}}))')
        report['checks'][name] = rows
        assert rows, f'No results: {query}'
        capture(name)
        if name == 'search-calculator':
            evaluate(f'{EXTENSION}._search._rows[0].activate()')
            # Read the clipboard through a test window later; selection itself is verified here.
            assert rows[0]['label'].startswith('= 84,'), 'Wrong calculator result'
        else:
            evaluate(f'{EXTENSION}._search.close()')
    shell('gnome-extensions prefs lightos@lightos.dev >/tmp/lightos-prefs.log 2>&1 &')
    time.sleep(1)
    capture('preferences')
    report['checks']['trayItems'] = evaluate(f'[...{EXTENSION}._tray._items.keys()]')
    report['checks']['gtkTheme'] = shell('gsettings get org.gnome.desktop.interface gtk-theme')
    report['checks']['font'] = shell('gsettings get org.gnome.desktop.interface font-name')
    report['checks']['icons'] = shell('gsettings get org.gnome.desktop.interface icon-theme')
    REPORT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(REPORT, flush=True)


if __name__ == '__main__':
    main()
