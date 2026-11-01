# Installation und Bedienung

LightOS benötigt GNOME Shell 50 unter Wayland sowie Python 3 für den Build.
Die Systemwerkzeuge benötigen zusätzlich PyGObject, GTK 4 und libadwaita.
Flatpak und Homebrew werden bei vorhandener Installation erkannt; Tesseract
ist optional für die lokale Texterkennung. Fehlende Voraussetzungen werden
angezeigt und nicht automatisch installiert.

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

Die Installation erfolgt im Benutzerprofil und benötigt kein sudo.
Entwicklung und interaktive Tests erfolgen ausschließlich in einer isolierten
GNOME-VM. `tools/vm.py` und `tools/test-vm.py` verwenden die lokal vorbereitete
VM unter `.cache/vm-gnome/`; VM-Abbilder und Zugangsdaten sind nicht enthalten.

## Bedienung

- **Super + Leertaste:** Suche öffnen. Pfeiltasten oder Tab wählen einen Treffer,
  Enter aktiviert ihn; bei Berechnungen kopiert Enter das Ergebnis. Escape oder
  ein Klick außerhalb schließen den Dialog. Dateisuche außerhalb zuletzt
  verwendeter Dateien benötigt einen aktivierten GNOME-Suchanbieter samt Index.
- **Super:** GNOME-Übersicht öffnen.
- **Strg + Super + C:** aktives Fenster auf seinem Monitor zentrieren. Maximierte
  Fenster werden vorher wiederhergestellt; Vollbildfenster bleiben ausgenommen.
- **System-Icon neben Quick Settings:** System-, Festplatten- und Netzwerkstatus,
  App-Updates, Cache-Bereinigung, Homebrew, App-Deinstallation und lokale OCR.

Die Suche sichert eine kollidierende GNOME-Belegung für den Tastaturlayoutwechsel
und stellt sie beim Deaktivieren wieder her. Activities, Quick Settings,
Kalender und Benachrichtigungen behalten ihre nativen Widgets.

## Einstellungen

- **Darstellung:** System, Hell oder Dunkel. Die Standardpalette ist Ocean;
  weitere Paletten sind Grove, Ember, Iris und Rose. ChromaLeon verwendet Farben
  aus dem Hintergrundbild. App-Anbindungen ändern Farben und erhalten native
  Schriftgrößen, Abstände und Widgetformen. Je nach Anwendung ist ein Neustart
  erforderlich; Flatpak-Berechtigungen werden nicht erweitert.
- **Tag-Nacht-Zyklus:** automatischer Wechsel bei Sonnenaufgang und -untergang.
  Bei freigegebenen Standortdiensten wird GeoClue verwendet, sonst eine grobe
  Zeitzonenschätzung. Koordinaten werden nicht gespeichert. Eine manuelle Wahl
  bleibt bis zum nächsten Sonnenwechsel erhalten; System beendet die Automatik.
- **Schriftfamilie:** Geist / Geist Mono als Standard oder Adwaita Sans / Mono.
  Größen und Stile bleiben erhalten. Mitgelieferte OFL-Schriften werden nur für
  den aktuellen Benutzer registriert; eigene Anwendungsschriften bleiben erhalten.
- **Top Bar mit 42 px:** optionale Panelhöhe, standardmäßig ausgeschaltet.
  Ausschalten stellt die native Höhe wieder her.
- **Fenster und Bedienung:** optionale Graustufen-Schriftglättung ohne Hinting
  und Druckanimationen, beide standardmäßig aus. Animationen berücksichtigen
  GNOMEs Einstellung für reduzierte Bewegung.
- **Maximieren auf eigener Arbeitsfläche:** standardmäßig aus. Wiederherstellen
  führt das Fenster auf seine vorherige Arbeitsfläche zurück; eine manuelle
  Arbeitsflächenwahl wird respektiert.

Farbpalette, Schriftprofil, Schriftglättung und Druckanimationen sind unabhängig.
Die Suche dimmt den Desktop nicht; helle Paletten gelten auch für Übersicht,
App-Raster, Quick Settings und Kalender.

## Deaktivierung

```bash
gnome-extensions disable lightos@lightos.dev
```

LightOS entfernt seine Panel-Einträge und stellt die verwalteten Farb-, App-,
Schrift- und Tastenkürzeleinstellungen wieder her. Ursprüngliche Werte liegen
unter `~/.local/state/lightos-gnome/`. Nachträgliche Benutzeränderungen werden
respektiert; eigene CSS-Regeln bleiben erhalten.

Quellnachweise und Lizenzbedingungen stehen in [THIRD_PARTY.md](../THIRD_PARTY.md).
