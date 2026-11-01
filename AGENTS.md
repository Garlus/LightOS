# LightOS Agent Notes

LightOS is a GNOME Shell extension for GNOME 50 / Wayland. The project is organized into `extension/` (Shell UI, search, palettes and optional app color adapters), `tools/` (packaging and isolated VM validation), `tests/`, and `docs/` (validation and visual evidence). `dist/` contains the installable extension ZIP.

Keep native GNOME styling. App themes may change colors, but must not change widget radii, padding, margins, fonts or icons. The search dialog has its own explicitly approved compact layout. Default colors are Ocean blue/turquoise. The panel has no running app icons or search button; search opens with Super + Space.

Explicit user-approved exceptions: optional global grayscale font smoothing without
hinting and optional press feedback transforms. Both default to off, restore their
owned state on disable, and never change font families or sizes. Press feedback
must respect GNOME's reduced-motion preference. Keep these options independent
of palette selection.

The user-approved font profile defaults to Geist / Geist Mono, with an Adwaita /
Geist segmented selector. It may replace interface, document and monospace font
families in the user profile, preserving sizes and styles. Keep this independent
of palettes and smoothing. Bundle the OFL fonts, register them only for the current
user, and restore owned font settings and registration on disable.

Keep GNOME's top bar native. Do not add custom system or application menus,
replace the Activities button, or hide native panel items. LightOS contributes
only StatusNotifier tray items from `tray.js`; Quick Settings, calendar and
notifications stay untouched. Palette-based panel colouring must not change the
panel structure or introduce new top bar actors.

When making changes, show every change with suitable screenshots or video recordings. For visual or interactive behavior, capture the running result; keep evidence in `docs/screenshots/gnome/` or `docs/videos/` and link it in your summary.

All desktop installation and interactive testing must happen in the isolated GNOME VM, never on the live host desktop. Build with `python3 tools/build.py`; install the current ZIP in the VM with `python3 tools/vm.py install` before validating changes. Under Wayland, reload an updated extension through a VM session restart. Shell Eval is a VM-only test aid and must be disabled after validation.

Keep `.cache/` intact during VM, SSH or recording work. It contains live disk images, backing images, credentials, logs, captures and recovery archives. In particular, do not delete or alter `.cache/vm/` or existing QCOW2 backing files.

Separate repositories under `prototypes/` are outside the LightOS source tree; do not alter them unless the task explicitly targets that repository.

Qt/KDE application color adapters, native syntax color assets and `org.kde.StatusNotifier*` D-Bus identifiers are GNOME integration features, not Plasma dependencies. Do not reintroduce Plasma widgets, KWin effects, a Qt widget style, global font/icon replacements or a system-wide desktop installer.

## Arbeitsweise und Kommunikation

Deine Antworten sollen Fachbegriffe verwenden. Stell dir vor, ein IBM engineer aus den achtzigern müsste einen technischen Report verfassen.
Falls du etwas gestalten solltest, dann bitte immer mit dem Frontend Design Skill. Gestalte standartweise alles sehr minimalistisch, keine knalligen Farben, es soll Lesbarkeit alleine durch gut gewählte Schriftgrößen und Hierarchie geschaffen werden.
Opencode ist auf dem System installiert. Generell kannst du immer Subagents verwenden, gerade bei Codingaufgaben. Mit Opencode kannst du auf Deepseek V4.1 Flash zugreifen, nutze das gerne.
Falls du an etwas gearbeitet hast, gerade was Entwicklung angeht, bitte zeig mir am Ende deine Arbeit entweder als Webseite oder mit Bildschirmfotos. Für längere, nicht unbedingt Coding Aufgaben, kannst du auch ein pdf anfertigen.
