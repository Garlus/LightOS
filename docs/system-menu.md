# LightOS-Systemmenü

Das System-Icon direkt links neben GNOMEs Quick Settings öffnet ein kompaktes
natives PopupMenu. Die Anordnung folgt der Funktionsgliederung von
[Vorssaint](https://github.com/vorssaint/vorssaint-utils). Dessen Swift-Anwendung
setzt macOS 14 voraus; LightOS implementiert die Funktionen eigenständig mit
Linux- und GNOME-Schnittstellen. Quellcode, Marken-Icon und macOS-Gestaltung
werden nicht übernommen.

## Gestaltung

Native PanelMenu-/PopupMenu-Elemente, symbolische GNOME-Icons und die vorhandene
Systemschrift bleiben maßgeblich. Ausrichtung: Beschriftung links, Messwert
rechts. Nur das eigene Menü verwendet 5 px vertikalen und 12 px horizontalen
Zeileninnenabstand sowie 340 px Mindestbreite. Quick Settings, Kalender und
Activities behalten ihren Aufbau und ihre Widgetmaße. Farben werden von der
aktiven LightOS-Palette geerbt. Ocean verwendet im hellen Modus Weiß als Panel,
helle Oberflächen und dunklen Text; in Dunkelstellung entsprechend dunkle
Oberflächen und hellen Text. Die Verlaufslinien verwenden die jeweilige
Vordergrundfarbe, ohne zusätzliche Signalfarben oder eigene Schriftgrößen.

## Funktionsumfang

| Bereich | Implementierung |
|---|---|
| System | CPU-Auslastung, Speicherbelegung, Dateicache, Swap und Betriebszeit; bis zu 40 Messpunkte für CPU und Speicher |
| Sensoren | Verfügbare hwmon-Temperaturen und DRM-gpu_busy_percent; fehlende Sensoren werden ausdrücklich benannt |
| Festplatten | Bis zu vier reale eingehängte Dateisysteme mit Belegung, freiem Platz und Öffnen im Dateimanager; aggregierte Lese-/Schreibraten ganzer Blockgeräte und Verlauf |
| Netzwerk | Aggregierte Download-/Uploadrate ohne Loopback, Verlauf, IPv4-Adressen und Schnittstellen |
| App Updates | Verfügbare Flatpak-App-Updates getrennt für Benutzer und System sowie Homebrew-Formel-Updates; Einzelaktualisierung nach Bestätigung |
| Aufräumen | Größenprüfung für Vorschaubild- und GNOME-Software-Caches, anschließend gezieltes Verschieben in den Papierkorb nach Bestätigung |
| Homebrew | Installierte Linux-Formeln anzeigen, suchen, installieren und entfernen; ohne Homebrew Installationsanleitung anzeigen |
| Deinstallierungsprogramm | Installierte Flatpak-Apps und Homebrew-Formeln mit Herkunft auflisten und einzeln entfernen; persönliche App-Daten bleiben erhalten |
| Bildschirmtext | Native Bereichsauswahl unter Wayland, lokale Tesseract-Erkennung Deutsch/Englisch nach verfügbaren Sprachdaten, editierbares Ergebnis und Textzwischenablage |
| Fenster | Optional beim Maximieren eigene Arbeitsfläche; Rückkehr beim Wiederherstellen, Ausschalten oder Deaktivieren |

Systempakete öffnen GNOME Software zur Aktualisierung bzw. Entfernung. Der
Paketmanager der Distribution wird nicht durch einen Shell-eigenen Installer
ersetzt. Die verwendeten Befehlsoptionen folgen der [Homebrew-Manpage](https://docs.brew.sh/Manpage). Homebrew-Casks sind macOS-spezifisch; unter Linux werden Formeln
verwaltet. Entwickler-Updatefeeds und automatische Hintergrundaktualisierungen
sind nicht Bestandteil dieser Integration.

SMART-Werte, privilegierte Prozess-Netzwerkzuordnung und hardwareunabhängige
GPU-Messung gehören nicht zum implementierten Umfang. Es werden weder
macOS-spezifische Werte emuliert noch fehlende Sensoren als Null ausgegeben.
Zählersummen in den Untermenüs erfassen die während geöffneter Menüs gemessenen
Intervalle, keine betriebssystemweite Sitzungshistorie.

## Laufzeit und Besitzverwaltung

`systemStats.py` liest procfs/sysfs und Dateisystembelegung, ohne Schreibzugriffe.
Die Shell startet die kurze Abfrage asynchron alle zwei Sekunden nur bei offenem
Menü. Schließen und Deaktivieren entfernen den Timer und brechen laufende
Abfragen ab. History, Messwerte und IPv4-Adressen verbleiben im Arbeitsspeicher.
Keine Netzwerkverbindung wird zum Systemmonitoring aufgebaut.

`systemTools.py` läuft als eigenständiger GTK-4-/libadwaita-Prozess.
Paketbefehle erhalten Argumentlisten und keine Shell-Kommandotexte.
Fehlermeldungen und Zeitüberschreitungen bleiben sichtbar. Paketänderungen
beginnen nur nach einer konkreten Einzelbestätigung. Administrationsrechte
werden gegebenenfalls vom vorhandenen Systemdienst angefordert.

Die Bereinigung berücksichtigt ausschließlich `$XDG_CACHE_HOME/thumbnails`
und `$XDG_CACHE_HOME/gnome-software`; Verzeichnissymlinks werden übersprungen.
Projekt-Caches und insbesondere LightOS `.cache/` werden nicht durchsucht oder
verändert. Erst das spätere Leeren des Papierkorbs gibt den Speicher frei.

OCR benötigt optional `tesseract` und passende Sprachdaten. Die Shell schreibt
den gewählten Bereich in eine private temporäre PNG-Datei; der Helfer entfernt
sie nach dem Erkennungsversuch. Erkanntes Material verlässt den Rechner nicht.
Das Ergebnisfenster bleibt für Korrekturen und erneutes Kopieren verfügbar.

`maximize-new-workspace` ist standardmäßig `false` und unabhängig von Palette,
Schriftprofil und Schriftglättung. Die Funktion wirkt auf neue
Maximierungsereignisse normaler, beweglicher Fenster; bestehende maximierte
Fenster, Vollbildfenster, angeheftete Fenster und transiente Dialoge werden
nicht umgeordnet. Mutter verwaltet weiterhin die Fenstergeometrie. Eine
inzwischen entfernte dynamische Quellarbeitsfläche wird bei der Rückkehr neu
angelegt. Leere selbst angelegte Zielarbeitsflächen werden entfernt. Manuelles
Verschieben auf eine andere Arbeitsfläche wird respektiert.

## Prüfung und Bildschirmnachweise

Alle interaktiven Prüfungen erfolgen in der isolierten Fedora-VM mit GNOME
Shell 50.5 unter Wayland. Build, Installation des aktuellen ZIPs und Neustart
der VM-Sitzung gehen der Validierung voraus. Shell Eval wird abschließend
deaktiviert.

- 16 Linux-Messwertprüfungen, einschließlich CPU-Gastzeit, Sektorgrößen, Mount-Deduplizierung und fehlenden Sensoren.
- 13 Paketadapter-/Cacheprüfungen mit isolierten Fixtures und gemockten Paketbefehlen.
- Bestehende GJS-Prüfungen für Suche, Farb-Engine, Schriften und Bedienung.
- [Laufzeitbericht](system-validation.json): Panelposition, echte Messwerte, Timerstopp, Hell/Dunkel, Werkzeugfenster, Arbeitsflächenwechsel, Rückkehr und Disable/Re-enable. Zusätzlich bestätigt: reale Testpaketentfernung einschließlich Abbrechen, feste Arbeitsflächen und OCR-Bereichsabbruch.
- [Menü](screenshots/gnome/system-menu-light.png), [System hell](screenshots/gnome/system-monitor-light.png), [System dunkel](screenshots/gnome/system-monitor-dark.png).
- [Festplatten](screenshots/gnome/system-disks-light.png), [Netzwerk](screenshots/gnome/system-network-light.png).
- [Updates](screenshots/gnome/system-app-updates.png), [Aufräumen](screenshots/gnome/system-cleanup.png), [Homebrew](screenshots/gnome/system-homebrew.png), [Deinstallation](screenshots/gnome/system-uninstall.png).
- [Bestätigte Testpaket-Deinstallation](screenshots/gnome/system-uninstall-confirmation.png) und [Ergebnis](screenshots/gnome/system-uninstall-after-confirmation.png).
- [Arbeitsflächenoption in den Einstellungen](screenshots/gnome/system-preferences.png).
- [OCR mit tatsächlich erkanntem Text](screenshots/gnome/system-ocr.png).
- [Maximiertes Fenster](screenshots/gnome/system-maximize-workspace.png) und [Arbeitsflächenübersicht](screenshots/gnome/system-maximize-overview.png).

Homebrew ist in der VM nicht installiert; seine Argumentlisten und JSON-Adapter
sind mit Fixtures geprüft, der reale Zustand ohne Installation ist abgebildet.
Die VM verfügt über keine GPU-/Temperatursensoren; die Anzeigen benennen das.

```bash
python3 tools/build.py
python3 tools/vm.py install
python3 tools/vm.py ssh 'sudo systemctl restart gdm'
python3 tools/test-vm.py
python3 tools/validate-system.py --enable-eval
```
