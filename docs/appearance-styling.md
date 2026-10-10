# Appearance: native GNOME-Karten in LightOS 6

Geprüft am 10. Oktober 2026 in der isolierten Fedora-44-VM mit GNOME Shell 50.5 / Wayland.

Die drei Darstellungskacheln, sechs vorhandenen Themes und drei ChromaLeon-Farben behalten ihr Raster. Ihre Buttons verwenden jetzt libadwaitas native `.card`-Klasse: eigene Kartenfläche, native Rundung und Schatten. Der selbst definierte transparente Hintergrund und die dünne, farbige Kachelumrandung wurden entfernt. Die aktive Auswahl ist an den Farbkreisen und der Akzentfarbe des Namens erkennbar; bei System/Hell/Dunkel kennzeichnet der Name die Auswahl. GNOMEs Tastaturfokus bleibt verfügbar.

Die Karten übernehmen ihre Farben wie die übrigen GNOME-Einstellungszeilen aus der gewählten Farb-Engine. Es gibt dafür keinen eigenen CSS-Provider und keine festgelegten Schatten, Radien oder Rahmen. Die native Kartenklasse und ihre automatischen Hover-/Aktiv-Zustände für Buttons sind in der [libadwaita-Dokumentation](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/1.9/style-classes.html#boxed-lists-cards) beschrieben.

## Prüfung am installierten ZIP

`python3 tools/build.py`, `python3 tools/vm.py install`, danach Neustart der VM-Sitzung über GDM. LightOS 6 ist ACTIVE. Die Aufnahme erfolgt direkt aus der laufenden VM.

- Native Auswahl von Ember schreibt `palette=ember`.
- Auswahl der zweiten ChromaLeon-Farbe aktiviert die Engine und schreibt `chroma-accent=#4976fd` beim hellen Adwaita-Hintergrundbild.
- Klick auf Dunkel schreibt `appearance=dark`; neu geöffnete Einstellungen zeigen die dunklen Kartenflächen.
- Auswahl von Ocean stellt `color-engine=t3` und `palette=ocean` wieder her.
- Hell und Dunkel für beide Engines visuell geprüft. T3-Raster und die dritte Zeile mit drei ChromaLeon-Farben bleiben vorhanden.
- Abschließend Ocean/Hell; AirDrop Aus und Shell Eval deaktiviert. Keine AirDrop-Updateüberwachung.

| Stand | VM-Aufnahme |
|---|---|
| Vorher: transparente Kacheln mit Umrandung | [LightOS 5](screenshots/gnome/appearance-themes.png) |
| Native Karten, Ocean/Hell | [Hell](screenshots/gnome/appearance-native-cards-light.png) |
| Native Karten, Ocean/Dunkel | [Dunkel](screenshots/gnome/appearance-native-cards-dark.png) |
| ChromaLeon/Hell und aktive zweite Farbe | [ChromaLeon hell](screenshots/gnome/appearance-native-cards-chromaleon-light.png) |
| ChromaLeon/Dunkel | [ChromaLeon dunkel](screenshots/gnome/appearance-native-cards-chromaleon-dark.png) |

Diese Änderung betrifft die Einstellungen und ihre Versionsnummer. Die zuvor geprüften Farb-Engines und AirDrop-Transporte wurden dabei nicht verändert; die 878 automatisierten Checks des [LightOS-5-Prüfberichts](chromaleon-validation.md) wurden für diese reine Darstellungsänderung nicht erneut ausgeführt.

## LightOS 7: Abstand zwischen Engine und Farbkacheln

Am 10. Oktober 2026 im aktuellen ZIP gebaut, in die VM installiert und nach einem GDM-Sitzungsneustart geprüft. Das Theme-Raster erhält oberhalb 12 Pixel Abstand, entsprechend seinem Zeilen- und Spaltenabstand. Damit stoßen die Farb-Engine-Zeile und die erste Kachelreihe nicht mehr aneinander.

Aufnahmen aus LightOS 7: [Ocean/Hell](screenshots/gnome/appearance-spacing-light.png), [ChromaLeon/Hell](screenshots/gnome/appearance-spacing-chromaleon.png), [ChromaLeon/Dunkel](screenshots/gnome/appearance-spacing-dark.png). Die native Farb- und Modusauswahl funktioniert weiterhin. Abschließend Ocean/Hell, Version 7 ACTIVE und Shell Eval deaktiviert. Reine Abstandsänderung; keine neuen automatisierten Tests.

ZIP SHA-256: `20457f7549f84b6c9e803bff12b607faf88616f94d985836cbf9cd4b1d5d8c75`.
