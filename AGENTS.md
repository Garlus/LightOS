# LightOS Agent Notes

LightOS is a GNOME Shell extension for GNOME 50 / Wayland. The project is organized into `extension/` (Shell UI, search, palettes and optional app color adapters), `tools/` (packaging and isolated VM validation), `tests/`, and `docs/` (validation and visual evidence). `dist/` contains the installable extension ZIP.

Keep native GNOME styling. App themes may change colors, but must not change widget radii, padding, margins, fonts or icons. The search dialog has its own explicitly approved compact layout. Default colors are Ocean blue/turquoise. The panel has no running app icons or search button; search opens with Super + Space.

When making changes, show every change with suitable screenshots or video recordings. For visual or interactive behavior, capture the running result; keep evidence in `docs/screenshots/gnome/` or `docs/videos/` and link it in your summary.

All desktop installation and interactive testing must happen in the isolated GNOME VM, never on the live host desktop. Build with `python3 tools/build.py`; install the current ZIP in the VM with `python3 tools/vm.py install` before validating changes. Under Wayland, reload an updated extension through a VM session restart. Shell Eval is a VM-only test aid and must be disabled after validation.

Keep `.cache/` intact during VM, SSH or recording work. It contains live disk images, backing images, credentials, logs, captures and recovery archives. In particular, do not delete or alter `.cache/vm/` or existing QCOW2 backing files. `prototypes/orb-lab/`, if present, is a separate Git repository; do not alter it unless the task specifically targets that prototype.

Qt/KDE application color adapters, native syntax color assets and `org.kde.StatusNotifier*` D-Bus identifiers are GNOME integration features, not Plasma dependencies. Do not reintroduce Plasma widgets, KWin effects, a Qt widget style, global font/icon replacements or a system-wide desktop installer.
