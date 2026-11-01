# Installation und Bedienung

LightOS benötigt GNOME Shell 50 unter Wayland. Die Standardpalette ist Ocean.
App-Anbindungen ändern Farben; native Schriftgrößen, Abstände und Widgetformen
bleiben erhalten.

## Installation

Im Projektverzeichnis:

```bash
python3 tools/build.py
gnome-extensions install --force dist/lightos@lightos.dev.shell-extension.zip
```

Unter Wayland anschließend ab- und wieder anmelden. Das gilt auch bei Updates.

```bash
gnome-extensions enable lightos@lightos.dev
gnome-extensions prefs lightos@lightos.dev
```

Die Installation erfolgt im Benutzerprofil und benötigt kein sudo. Entwicklung
und interaktive Tests erfolgen ausschließlich in der [isolierten VM](vm-access.md).

## Bedienung

- **Super + Leertaste:** Suche öffnen. Pfeiltasten oder Tab wählen einen Treffer,
  Enter aktiviert ihn, Esc schließt den Dialog. Bei Berechnungen kopiert Enter
  das Ergebnis. Dateisuche außerhalb zuletzt verwendeter Dateien benötigt einen
  aktivierten GNOME-Suchanbieter samt Index.
- **Super:** GNOME-Übersicht öffnen.
- **Strg + Super + C:** aktives Fenster auf seinem Monitor zentrieren. Maximierte
  Fenster werden vorher wiederhergestellt; Vollbildfenster und nicht verschiebbare
  Fenster bleiben ausgenommen.

Die Suche sichert eine kollidierende GNOME-Belegung für den Tastaturlayoutwechsel
und stellt sie beim Deaktivieren wieder her. Die Top Bar bleibt GNOME-nativ:
Activities, Quick Settings, Kalender und Benachrichtigungen behalten ihre nativen Widgets;
LightOS fügt StatusNotifier-Einträge und das kompakte System-Icon direkt links neben Quick Settings hinzu.

Aktueller VM-Nachweis: [native Schnelleinstellungen](screenshots/gnome/native-quick-settings.png),
[LightOS-Einstellungen](screenshots/gnome/native-panel-preferences.png) und
[Suche per Tastenkürzel](screenshots/gnome/native-panel-search.png).
Der [Prüfbericht](native-panel-validation.json) enthält den Strukturvergleich
mit deaktivierter und erneut aktivierter Erweiterung.

## Farben und Einstellungen

Im Reiter **Appearance** stehen System, Hell und Dunkel zur Wahl. Die festen
Paletten heißen Ocean, Grove, Ember, Iris und Rose. ChromaLeon liefert
zusätzlich bis zu drei Farben aus dem aktuellen Hintergrundbild. System stellt
die ursprüngliche GNOME-Darstellung wieder her.

Die Farb-Engine **Paletten** verwendet Ocean, Grove, Ember, Iris oder Rose.
Die frühere Auswahl „T3 Code“ wird beim Update zu Ocean, „T3 Chat“ zu Rose.
Die Herkunft der Farbwerte ist weiterhin im Lizenzverzeichnis dokumentiert.
[Bereinigte Farbauswahl](screenshots/gnome/appearance-palettes-clean.png) und
[Migrationsprüfung in GNOME 50.5](palette-validation.json).

Die App-Farbanbindung unterstützt GTK 3/4, libadwaita, GtkSourceView, Ptyxis,
GNOME Terminal, Qt/KDE-Anwendungen, Kate/KWrite und Code/VSCodium sowie vorhandene
private Flatpak-Konfigurationen. Ptyxis unterstützt vollständige Terminalpaletten;
GNOME Console übernimmt nur den Hell-/Dunkelmodus. Neue Farben erfordern je nach
Anwendung einen Neustart. Flatpak-Berechtigungen werden nicht erweitert.

Die optionale Sonnenautomatik verwendet GeoClue bei freigegebenen Standortdiensten,
sonst eine grobe Zeitzonenschätzung. Diese kann von den örtlichen Sonnenzeiten
abweichen. Koordinaten werden nicht gespeichert. Eine manuelle Moduswahl bleibt
bis zum nächsten Sonnenwechsel erhalten; System schaltet die Automatik aus.

Unter **LightOS → Fenster und Bedienung** sind Graustufen-Schriftglättung ohne
Hinting und Druckanimationen unabhängig aktivierbar. Beide sind standardmäßig
ausgeschaltet. Die Schriftoption lässt Familien und Größen unverändert;
Druckanimationen beachten GNOMEs Einstellung für reduzierte Bewegung.

Direkt unter der Darstellungswahl schaltet **Schriftfamilie → Adwaita / Geist** die Schriftfamilien
für Oberfläche, Dokumente und Festbreitentext gemeinsam um. Standardmäßig sind
**Geist** und **Geist Mono** aktiv; Adwaita verwendet **Adwaita Sans** und
**Adwaita Mono**. Schriftgrößen, Gewicht und Kursivstellung bleiben erhalten.
Die Auswahl wirkt sofort auf GNOME und Anwendungen, die deren Systemschrift
verwenden; eigene Anwendungsschriften bleiben anwendungsspezifisch.
Schriftdateien einschließlich Kursivschnitten sind im ZIP enthalten und werden
ausschließlich im Benutzerprofil registriert. Die Auswahl ist unabhängig von
Farbpalette und Schriftglättung. Beim Deaktivieren stellt LightOS die vorherigen
Schrifteinstellungen wieder her und entfernt seine Schriftregistrierung, sofern
keine gesperrten Einstellungen oder externen Geist-Schriftwerte sie noch benötigen.

Schriftfamilie und **Tag-Nacht-Zyklus** stehen gemeinsam unmittelbar unter der
Darstellungswahl, ohne eigene Überschrift oder Beschreibung:
[aktuelle Einstellungsansicht](screenshots/gnome/appearance-palettes-clean.png).

Geprüft in GNOME Shell 50.5 / Wayland: [Geist-Auswahl](screenshots/gnome/font-geist-preferences.png),
[Adwaita-Auswahl](screenshots/gnome/font-adwaita-preferences.png),
[Geist Mono im Terminal](screenshots/gnome/font-geist-mono-terminal.png).
Der [Laufzeitbericht](font-validation.json) dokumentiert Profilwechsel,
Schriftauflösung und Wiederherstellung einschließlich abgeschaltetem Shell Eval.

## Deaktivierung

```bash
gnome-extensions disable lightos@lightos.dev
```

LightOS entfernt seine StatusNotifier-Einträge und das System-Icon aus der Top Bar und stellt die
verwalteten Farb-, App-, Schrift- und Tastenkürzeleinstellungen wieder her.
Ursprüngliche Werte liegen unter `~/.local/state/lightos-gnome/`. Nachträgliche
Benutzeränderungen werden respektiert; eigene CSS-Regeln bleiben erhalten.

Für Entwicklung: [Architektur und Build](architecture.md),
[VM-Zugang und Prüfung](vm-access.md), [Quellnachweise](../THIRD_PARTY.md).

## Erweiterte Suche

Die Suche unter Super + Leertaste verwendet jetzt die in [Oma Cast](https://github.com/typecraft-dev/oma-cast) beschriebenen Launcher-Konzepte mit nativen GNOME-Widgets. Bedienung, Datenschutz und Umfang stehen in der [Suchdokumentation](oma-cast.md). Die [Bewertung der Themeninstallation](theme-installation-evaluation.md) beschreibt einen möglichen JSON-Farbpalettenimport; ein Importdialog ist noch nicht implementiert.

## Panelhöhe und helle Shell

Unter **LightOS → Top Bar und Suche → Top Bar mit 42 px** lässt sich die
Panelhöhe auf 42 logische Pixel einstellen. Standardmäßig bleibt die native
GNOME-Höhe aktiv. Die Option wirkt sofort, unabhängig von Palette und
Hell-/Dunkelmodus; GNOME passt den reservierten Arbeitsbereich an. Ausschalten
oder Deaktivieren stellt die native Höhe wieder her. Schrift- und Symbolgrößen
bleiben erhalten.

Alle hellen Paletten einschließlich ChromaLeon verwenden eine durchgehend helle
Übersicht einschließlich Dash, App-Raster, App-Ordnern und Overview-Suche sowie
helle Quick Settings und einen hellen Kalender. Die Top Bar ist weiß mit
schwarzem Text. Die früheren
ChromaLeon-Schalter für teilweise helle Darstellung entfallen; gespeicherte
Legacy-Werte können keine dunklen Menüs im hellen Modus erzwingen.

Nachweise: [Option in den Einstellungen](screenshots/gnome/panel-height-preferences.png),
[Panel mit 42 px](screenshots/gnome/panel-42-light.png),
[Kalender](screenshots/gnome/light-ocean-calendar.png),
[Laufzeit- und Rücknahmeprüfung](shell-layout-validation.json).

Die LightOS-Suche legt keine Vignette und keine Abdunklung über den Desktop.
Die transparente modale Eingabeabschirmung bleibt aktiv: Der Fokus bleibt im
Suchdialog; Escape und ein Klick außerhalb schließen ihn. Die Hintergrundfarben
bleiben im hellen und dunklen Modus unverändert.

Nachweise: [helle Übersicht](screenshots/gnome/overview-light-ocean.png),
[Suche ohne Vignette](screenshots/gnome/search-undimmed-light.png),
[Hintergrundvergleich und Rücknahme](overview-validation.json).

## Systemmenü und Werkzeuge

Das Monitor-Icon direkt links neben Quick Settings öffnet das kompakte
[Systemmenü](system-menu.md). System, Festplatten und Netzwerk sind aufklappbar;
die fünf Werkzeuge starten native GTK-/libadwaita-Fenster.

**Maximieren auf eigener Arbeitsfläche** ist standardmäßig aus. Der Schalter im
Systemmenü und die gleichnamige Option unter Appearance sind synchronisiert.
Er wirkt auf anschließend maximierte, normale Fenster. Wiederherstellen,
Ausschalten oder Deaktivieren von LightOS führt selbst verschobene Fenster
zurück. Eine manuell gewählte andere Arbeitsfläche wird respektiert.

Python 3 mit PyGObject, GTK 4 und libadwaita wird für die Werkzeuge benötigt.
Flatpak und Homebrew werden bei vorhandener Installation erkannt; Tesseract
ist eine optionale Voraussetzung der lokalen Texterkennung. Fehlende
Voraussetzungen werden angezeigt und nicht automatisch installiert.
