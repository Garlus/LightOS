#!/usr/bin/env python3
"""Package LightOS as a standard GNOME Shell extension, without installing it."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'extension'
OUTPUT = ROOT / 'dist/lightos@lightos.dev.shell-extension.zip'


def main():
    metadata = json.loads((SOURCE / 'metadata.json').read_text())
    assert metadata['uuid'] == 'lightos@lightos.dev'
    OUTPUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUTPUT, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(SOURCE.rglob('*')):
            if path.is_file() and path.suffix not in {'.compiled', '.pyc'} and '__pycache__' not in path.parts:
                archive.write(path, path.relative_to(SOURCE))
    print(OUTPUT)


if __name__ == '__main__':
    main()
