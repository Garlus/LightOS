#!/usr/bin/env python3
"""Sync the GNOME source snapshot and run isolated tests in the test VM."""
from pathlib import Path
import subprocess
import tarfile
import tempfile

from vm import ROOT, ssh_args

REMOTE_PROJECT = '~/LightOS-GNOME-project'


def main():
    with tempfile.TemporaryFile() as stream:
        with tarfile.open(fileobj=stream, mode='w') as archive:
            for name in ['extension', 'tools', 'tests', 'README.md', 'AGENTS.md', 'LICENSE']:
                archive.add(ROOT / name, arcname=name, filter=lambda member:
                            None if '__pycache__' in Path(member.name).parts or member.name.endswith('.pyc') else member)
            for path in sorted((ROOT / 'docs').glob('*')):
                if path.is_file():
                    archive.add(path, arcname=str(path.relative_to(ROOT)))
        stream.seek(0)
        # Replace only this dedicated VM test snapshot; the active installed
        # extension and ~/Documents are outside it. Preserve the previous copy.
        sync = f'''set -eu
stage=$(mktemp -d "$HOME/LightOS-GNOME-stage.XXXXXX")
tar -xf - -C "$stage"
if [ -d {REMOTE_PROJECT} ]; then
    previous=$(mktemp -d "$HOME/LightOS-GNOME-previous.XXXXXX")
    mv {REMOTE_PROJECT} "$previous/project"
fi
mv "$stage" {REMOTE_PROJECT}
'''
        subprocess.run(ssh_args() + [sync], stdin=stream, check=True)
    command = f'''set -eu
cd {REMOTE_PROJECT}
test_root=$(mktemp -d)
trap 'rm -rf "$test_root"' EXIT
export XDG_CONFIG_HOME="$test_root/config"
export XDG_DATA_HOME="$test_root/data"
export XDG_STATE_HOME="$test_root/state"
export GSETTINGS_BACKEND=memory
gjs -m tests/test_gnome.js
gjs -m tests/test_gnome_terminal.js
gjs -m tests/test_gnome_extra.js
gjs -m tests/test_chromaleon.js
gjs -m tests/test_solar.js
gjs -m tests/test_orb_motion.js
gjs -m tests/test_font_rendering.js
gjs -m tests/test_interaction_animations.js
python3 -B tests/test_airdrop.py
'''
    subprocess.run(ssh_args() + [command], check=True)


if __name__ == '__main__':
    main()
