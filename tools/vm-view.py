#!/usr/bin/env python3
"""Open the isolated GNOME test VM in a local browser with noVNC."""
import argparse
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache'
NOVNC = CACHE / 'novnc'
URL = ('http://127.0.0.1:6080/vnc.html?host=127.0.0.1&port=6081'
       '&path=.&encrypt=false&autoconnect=true&resize=scale')
NOVNC_REV = 'a8dfd6a3ea3c74244f5ebdaa5a7f1023007a7820'  # noVNC v1.6.0


def listening(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=1):
            return True
    except OSError:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-open', action='store_true', help='print the URL without opening a browser')
    args = parser.parse_args()
    CACHE.mkdir(exist_ok=True)
    if not listening(5910):
        subprocess.run([sys.executable, str(ROOT / 'tools/vm.py'), 'start'], check=True)
    if not listening(6081):
        raise RuntimeError('VM was started with older tools. Shut it down with '
                           'python3 tools/vm.py stop, then run this command again.')
    if not NOVNC.exists():
        subprocess.run(['git', 'clone', '--depth', '1', '--branch', 'v1.6.0',
                        'https://github.com/novnc/noVNC.git', str(NOVNC)], check=True)
    actual = subprocess.check_output(['git', '-C', str(NOVNC), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != NOVNC_REV:
        raise RuntimeError('Unexpected noVNC revision; existing cache was preserved.')
    if not listening(6080):
        with (CACHE / 'vm-gnome/viewer.log').open('ab') as log:
            process = subprocess.Popen([sys.executable, '-m', 'http.server', '6080',
                                        '--bind', '127.0.0.1', '--directory', str(NOVNC)],
                                       stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                       start_new_session=True)
        (CACHE / 'vm-gnome/viewer.pid').write_text(str(process.pid))
    for _ in range(50):
        try:
            with urllib.request.urlopen(URL, timeout=1) as response:
                if response.status == 200 and b'noVNC' in response.read(50000):
                    break
        except OSError:
            time.sleep(.1)
    else:
        raise RuntimeError('VM browser viewer did not become ready. See .cache/vm-gnome/viewer.log.')
    print(URL)
    if not args.no_open:
        webbrowser.open(URL)


if __name__ == '__main__':
    main()
