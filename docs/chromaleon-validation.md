# ChromaLeon in LightOS 5 – VM-Prüfung

Geprüft am 10. Oktober 2026 unter Fedora 44, GNOME Shell 50.5 / Wayland.
Die Erweiterung wurde mit `python3 tools/build.py` gebaut, mit
`python3 tools/vm.py install` installiert und nach einem VM-Sitzungsneustart
geprüft. Die Host-Desktop-Konfiguration wurde nicht installiert oder getestet.

## Ergebnis

**878 automatisierte Checks bestehen:** 456 GNOME, 299 GTK4-Terminal,
49 weitere App-Farben, 64 ChromaLeon und 10 echte lokale AirDrop-TLS-Tests.
`python3 tools/test-vm.py` verwendet getrennte XDG-Verzeichnisse und ein
GSettings-Speicherbackend für diese Tests.

ChromaLeons originale Farbextraktion liefert aus GNOMEs JPEG-XL-Wallpaper
`amber-l.jxl` drei Farben: `#e86a02`, `#e24658` und `#cb529b`.
Die native Preferences-Seite zeigt System/Hell/Dunkel, die sechs bestehenden
Themes und die drei zusätzlichen Farben in der dritten Theme-Zeile.
Die JXL-Vorschau verwendet denselben GdkPixbuf-Decoder wie die Extraktion.
Die dargestellten Einstellungen sind mit der laufenden Engine verbunden.

Die interaktiven Laufzeitprüfungen in [validate-chromaleon.py](../tools/validate-chromaleon.py)
prüfen Hell/Dunkel, durchgehend helle Leiste, Tint-Stärke, Panel-Opt-out,
GTK3-Opt-out, Flatpak-Schalter, generierte Ordner- und App-Farben, eigene
Shell-Farbregeln, die Raster-Verknüpfung und GNOMEs eigene Akzentfarbe.
Nach Ausschalten der Icon-Farben ist die vorherige Icon-Einstellung wieder da.
Nach Deaktivieren stimmen die originalen GTK3-/GTK4-Dateien bytegenau mit
den vorherigen Dateien überein. Eigene CSS-Regeln bleiben erhalten.

Die Größen, Paddings und Rahmen der nativen GTK4-Headerbar, Buttons, Eingaben
und Schalter entsprechen in Hell **und** Dunkel exakt der nativen Basis.
Die Messdaten und zehn bestätigten Laufzeitprüfungen stehen in
[chromaleon-validation.json](chromaleon-validation.json).
Der Rückschalt-Test prüft auch die tatsächlich sichtbare Panel-Farbe.
Inhaltlich benannte Stylesheet-Dateien umgehen dabei GNOME Shells URI-Cache.
Shell- und GTK3-Templates werden zusätzlich auf Farbdeklarationen begrenzt;
Geometrie, Schattengeometrie, Fonts und Icon-Größen werden nicht übernommen.

## Aufnahmen aus der laufenden VM

| Verhalten | Aufnahme |
|---|---|
| T3-Layout mit sechs bisherigen Themes | [Appearance](screenshots/gnome/appearance-themes.png) |
| ChromaLeon als dritte Theme-Zeile und aktive Engine | [Drei Farben](screenshots/gnome/appearance-chromaleon-selected.png) |
| JPEG-XL-Vorschau, GNOME-Farben, Persistent Choices, heller Stil | [Hintergrundbild und Farben](screenshots/gnome/appearance-wallpaper-settings.png) |
| Shell, Panel, Apps, GTK3, Intensität, dunklere Farben, Icon-Optionen | [Einfärbung und Symbole](screenshots/gnome/appearance-tint-settings.png) |
| Stylesheet, Hot Reload, Flatpaks und Raster-Verknüpfung | [Anpassung und Verschiedenes](screenshots/gnome/appearance-custom-flatpak-settings.png) |
| Aktiviertes eigenes Stylesheet | [Stylesheet aktiv](screenshots/gnome/appearance-custom-stylesheet-active.png) |
| Nativer Stylesheet-Dateidialog | [Datei wählen](screenshots/gnome/appearance-stylesheet-chooser.png) |
| Helle Shell-Farben und AirDrop-Kachel | [Quick Settings hell](screenshots/gnome/chromaleon-light-quick-settings.png) |
| Vollständig helle Leiste | [Durchgehend hell](screenshots/gnome/chromaleon-full-light.png) |
| Höchste Tint-Stärke | [Stärker](screenshots/gnome/chromaleon-strong-tint.png) |
| Panel ohne Tint | [Panel-Opt-out](screenshots/gnome/chromaleon-native-panel.png) |
| Generierte SVG-Farben und native App-Flächen | [Dateien und Icons](screenshots/gnome/chromaleon-icon-colors.png) |
| Farbregeln aus eigenem Stylesheet | [Custom CSS](screenshots/gnome/chromaleon-custom-css.png) |
| Dunkle Shell-Farben | [Quick Settings dunkel](screenshots/gnome/chromaleon-dark-quick-settings.png) |
| Dunklere Flächen | [Dunkler](screenshots/gnome/chromaleon-darker.png) |
| Native GNOME-Akzentfarbe als Quelle | [GNOME-Farben](screenshots/gnome/chromaleon-gnome-accent.png) |

## Grenzen und abschließender Stand

MoreWaita ist in der VM nicht installiert; die entsprechende Option wird
sichtbar mit diesem Grund deaktiviert. Die Integration installiert keine
Symbolpakete. GTK4-Apps, die das Standard-Kontrastsignal für Hot Reload nicht
verarbeiten, müssen neu geöffnet werden. Flatpak-Opt-out und GTK3-Opt-out
werden durch vorhandene LightOS-Wiederherstellungsjournale umgesetzt;
Sandbox-Berechtigungen werden nicht geändert.

Die AWDL-/Apple-Hardware-Grenzen der AirDrop-Prüfung gelten weiterhin;
[AirDrop-Prüfbericht](airdrop-validation.md). Die virtuelle Transportprüfung
belegt keinen Transfer zu einem Apple-Gerät. Die angefragte automatische
AirDrop-Updateüberwachung wurde auf Wunsch nicht eingerichtet.

Abschließend: LightOS 5 aktiv, Ocean/Hell als Standard, optionale Icon-Farben
und Custom CSS aus, ursprüngliche GNOME-Hintergrundbilder wiederhergestellt,
AirDrop Aus und Shell Eval deaktiviert. Die VM bleibt über den
[lokalen Browserzugang](vm-access.md) selbst testbar.
