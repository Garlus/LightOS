# Automatischer Darstellungsmodus in LightOS 8

Geprüft am 10. Oktober 2026 unter Fedora 44, GNOME Shell 50.5 / Wayland, ausschließlich in der isolierten GNOME-VM. Mit `python3 tools/build.py` gebaut, per `python3 tools/vm.py install` installiert und anschließend die VM-Sitzung über GDM neu gestartet.

## Ergebnis

**940 automatisierte Checks bestehen:** 456 GNOME, 299 GTK4-Terminal, 49 weitere App-Farben, 64 ChromaLeon, 62 Sonnenzeit-/Scheduler-Checks und 10 lokale AirDrop-TLS-Tests. `python3 tools/test-vm.py` verwendet isolierte XDG-Verzeichnisse und ein GSettings-Speicherbackend.

Die neuen Checks prüfen unter anderem Sommer-/Winter-Sonnenzeiten, exakte Tag-/Nacht-Grenzen, Sommerzeit, UTC+14 und die Datumsgrenze, Polartag/-nacht, echte Nullkoordinaten, ungültige Standorte, Zeitzonendaten, manuelle Übersteuerung, optionale fehlende GeoClue-Bibliotheken, Berechtigungsentzug, Client-Cleanup und verspätete asynchrone Antworten. Ein Check lässt den **echten GLib-Timer** den Modus wechseln, ohne `refresh()` am Übergang aufzurufen.

Im installierten Stand bestehen zusätzlich **elf Laufzeitprüfungen**: Sonnenaufgang → Hell, Sonnenuntergang → Dunkel, manuelle Wahl über die native GNOME-Farbeinstellung, Freigabe der Übersteuerung beim nächsten Sonnenwechsel, Neuberechnung für eine andere Zeitzone, Standortpriorität, ungültiger Fix → Zeitzonenschätzung, ChromaLeon folgt der Automatik, System-Auswahl beendet die Automatik, vollständiger Timer-Cleanup mit Wiederherstellung beim Deaktivieren und Neuberechnung beim erneuten Aktivieren. [Messprotokoll](solar-validation.json), [VM-Prüfwerkzeug](../tools/validate-solar.py).

Für `Europe/Berlin` werden am 10. Oktober 2026 am Referenzort etwa **07:23** und **18:23** berechnet. Die Option und ihre Statuszeile sind native libadwaita-Einstellungen im Appearance-Reiter. Die Kartenabstände und das T3-Raster bleiben erhalten.

## Aufnahmen der laufenden VM

| Verhalten | Aufnahme |
|---|---|
| Neue Option, standardmäßig aus | [Automatik aus](screenshots/gnome/solar-option-off.png) |
| Tatsächlicher Systemzeitpunkt, Standortdienste aus, grobe Zeitzonenschätzung | [Quelle und Sonnenzeiten](screenshots/gnome/solar-timezone-fallback.png) |
| Nach dem Sonnenaufgang, Testuhr | [Hell](screenshots/gnome/solar-sunrise-light.png) |
| Nach dem Sonnenuntergang, Testuhr | [Dunkel](screenshots/gnome/solar-sunset-dark.png) |
| Native Quick Settings im automatisch dunklen Modus, Testuhr | [Quick Settings](screenshots/gnome/solar-dark-quick-settings.png) |
| Helle manuelle Übersteuerung in der Nacht, Testuhr | [Manuelle Wahl](screenshots/gnome/solar-manual-override.png) |
| Standortzweig mit synthetischen Tokio-Koordinaten, Testuhr | [Standort-Testdaten](screenshots/gnome/solar-location-fixture.png) |
| Automatisch dunkle ChromaLeon-Farben, Testuhr | [ChromaLeon nachts](screenshots/gnome/solar-chromaleon-night.png) |
| Abschließender Stand mit tatsächlicher Systemzeit | [VM bereit](screenshots/gnome/solar-ready.png) |

Die Übergangstests verwenden eine nur im Scheduler injizierte Testuhr. Die Systemuhr, NTP und Zeitzonenkonfiguration der VM werden nicht verändert. Die gezeigten Uhrzeiten im Panel bleiben deshalb die echten Uhrzeiten. Die Einstellungen wurden für Aufnahmen bei Bedarf als App neu gestartet, damit auch die aktuelle GTK-Farbdatei geladen ist.

## Standort und Grenzen

Die VM hat kein GPS-Gerät. Der echte Zeitzonen-Fallback wurde in der laufenden Sitzung geprüft; der Standortzweig und seine Priorität wurden mit synthetischen Koordinaten geprüft, asynchrone GeoClue- und Cancel-/Stop-Abläufe mit Testobjekten im isolierten GJS-Test. **Ein echter GPS-Fix ist damit nicht hardwareseitig bestätigt.**

GeoClue wird nur bei aktivierter Automatik und freigegebenen GNOME-Standortdiensten angesprochen. Ohne Bibliothek, Freigabe oder Fix bleibt die Zeitzonenschätzung aktiv. Eine ausstehende Abfrage wird nach 20 Sekunden abgebrochen; erfolglose Abfragen werden nach 15 Minuten erneut versucht. Koordinaten bleiben im Arbeitsspeicher und werden bei Abbruch oder Deaktivierung verworfen. Es wird keine Standortfreigabe eingeschaltet.

Der Referenzort einer Zeitzone ist eine grobe Schätzung, kein nachgewiesener Wohnort. Unbekannte UTC-Versatz-Zonen verwenden einen geschätzten Längengrad am Äquator. Sonnenformeln berücksichtigen den üblichen scheinbaren Horizont; lokale Gelände- und Wettereffekte sind nicht enthalten. Apps, die ihre GTK-Farbdatei nicht neu einlesen, müssen wie bisher neu geöffnet werden; die native GNOME-Farbpräferenz und Shell wechseln unmittelbar.

Nach den Prüfungen: LightOS 8 ACTIVE, Ocean, Automatik in der Test-VM **an**, echte Systemuhr, keine Testkoordinaten und Shell Eval **aus**. Die Standortdienste bleiben ausgeschaltet. Bei einer Neuinstallation ist die Option standardmäßig aus. [VM-Zugang](vm-access.md).

## Herkunft

Sonnenformeln adaptiert aus [Night Theme Switcher](https://gitlab.com/rmnvgr/nightthemeswitcher-gnome-shell-extension/-/blob/87ef3094137c7943b3d0a8fdf7420ea57827653b/src/modules/Timer.js), GPL-3.0-or-later. [Quellmanifest](../extension/solar/SOURCES.json), [Lizenz](../extension/licenses/Night-Theme-Switcher-GPL-3.0.txt). Zeitzonenkoordinaten aus den installierten, public-domain IANA-Tabellen. Berechnung, Fallback und Datenquellen sind auch im [README](../README.md#automatisch-hell-und-dunkel-wechseln) beschrieben.

ZIP SHA-256: `eab31e0a6105d652e937b4d9dec745916b3c4c57be7c589b395fc87a044336af`.
