# Third-party source inventory

LightOS' own code is GPL-3.0; original file notices and separately bundled
licenses retain their original terms. Source revisions are pinned deliberately.
This repository does not include the VM disks, SSH keys, generated AirDrop
identities, viewer dependencies or the separate prototype repository.

## ChromaLeon

Source: https://github.com/Fabito02/ChromaLeon, Fabito02,
revision `b2c5cd2cf410c14c22278b894d04ab8d60f5eb59`.

- `utils/colorUtils.js` → `extension/chromaleon/vendor/colorUtils.js`:
  cancellable asynchronous reads with rejected errors, a three-color result,
  distinct-color selection, original HSL/contrast/ranking algorithm retained.
- `utils/recolorUtils.js` → `extension/chromaleon/vendor/recolorUtils.js`:
  namespaced generated icon themes, separate folder opt-out, activation delegated
  to LightOS' journal so the previous icon setting can be restored.
- `utils/cancellation.js` copied without changes.
- `templates/*.template.css` copied without changes. The adapter extracts color
  declarations from Shell and GTK3 templates and never replaces GNOME's base
  stylesheet. GTK4 templates contain only color declarations and variables.
- `extension/chromaleon/engine.js`: LightOS adapter using the upstream template
  substitutions and tint-strength formula; dynamic tokens for existing app adapters.
- `extension/chromaleon/runtime.js`: wallpaper lifetime, isolated LightOS settings,
  opt-in generated icons, stylesheet monitor and reversible launcher integration.

License: `extension/licenses/ChromaLeon-GPL-3.0.txt`.
The generated Shell templates retain Red Hat/Intel copyright and LGPL-2.1
notices; that license is included separately as
`extension/licenses/ChromaLeon-Shell-LGPL-2.1.txt`.
ChromaLeon credits Tint My GNOME and other inspirations in its upstream README.

## Omdrop

Source: https://github.com/brentkearney/omdrop-plugin, Brent Kearney,
revision `58fca678b08d3a7c875c83c7dfc2f0d3251cce44`.
License: `extension/licenses/Omdrop-MIT.txt`.
Imported receiver, identity, contacts, debug support and public Apple CA
certificates are described in `extension/airdrop/README.md`.
LightOS adds explicit consent IPC, isolated state paths, one-use upload approval,
archive-name checks and its own GTK interface and sender transport.

## Existing palette source

Source: https://github.com/pingdotgg/t3code, T3 Tools Inc.,
revision `e803242d936af3e052757d59ab32bc7c4fcc2390`.
The six palettes in `extension/palettes/` derive from
`packages/shared/src/themePalettes.ts`, converted from OKLCH to sRGB.
License: `extension/licenses/T3-Code-MIT.txt`.

## References and separately downloaded development tooling

OWL and OpenDrop remain references / external radio prerequisites; their source
is not copied into LightOS. noVNC v1.6.0 is downloaded to `.cache/novnc` only
by the local viewer tool, retaining its original MPL-2.0 license files. QEMU
provides the WebSocket transport. None of these tools install a desktop theme
on the host.

## Night Theme Switcher / Sonnenzeiten

- Quelle: [rmnvgr/nightthemeswitcher-gnome-shell-extension](https://gitlab.com/rmnvgr/nightthemeswitcher-gnome-shell-extension), Revision `87ef3094137c7943b3d0a8fdf7420ea57827653b`.
- Übernommen: der NOAA-basierte Formelblock aus `src/modules/Timer.js` in `extension/solar/solar.js`. Die SPDX-Autorenangabe bleibt erhalten.
- Änderungen: reine UTC-Berechnung, lokaler Kalendertag, Koordinatenvalidierung, Polartag/-nacht, Datumsgrenze. Zeitplan, Zeitzonenschätzung, optionale GeoClue-Anbindung und LightOS-Einstellungen sind eigene Adapter.
- Lizenz: GPL-3.0-or-later, im ZIP unter `licenses/Night-Theme-Switcher-GPL-3.0.txt`. Quellpfad und SHA-256 stehen in `solar/SOURCES.json`.
- IANA-Zeitzonendaten: die installierten `zone1970.tab` und `zone.tab` werden nur gelesen. Diese Tabellendaten sind public domain; sie werden nicht mitkopiert. [IANA tzdb](https://www.iana.org/time-zones), [Tabellenformat](https://github.com/eggert/tz/blob/main/zone1970.tab).
- GeoClue ist ein optionaler Systemdienst, kein mitkopierter Bestandteil. Ohne freigegebene Standortdienste, Bibliothek oder Standort bleibt die Zeitzonenschätzung aktiv.
