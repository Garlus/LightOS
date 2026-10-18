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
- **Strg + Super + C:** aktives Fenster auf seinem Monitor zentrieren. Die Aktion
  steht auch im App-Menü. Maximierte Fenster werden vorher wiederhergestellt;
  Vollbildfenster und nicht verschiebbare Fenster bleiben ausgenommen.
- **Orb-Menü:** Systemaktionen und Farbwahl. Rechts befinden sich GNOMEs native
  Quick Settings, Kalender und Benachrichtigungen.

Die Suche sichert eine kollidierende GNOME-Belegung für den Tastaturlayoutwechsel
und stellt sie beim Deaktivieren wieder her. Das App-Menü bietet Fensteraktionen;
es ist kein universelles globales GTK-Anwendungsmenü.

## Farben und Einstellungen

Im Reiter **Appearance** stehen System, Hell und Dunkel zur Wahl. Die festen
Paletten heißen Ocean, Grove, Ember, Iris, T3 Chat und T3 Code. ChromaLeon liefert
zusätzlich bis zu drei Farben aus dem aktuellen Hintergrundbild. System stellt
die ursprüngliche GNOME-Darstellung wieder her.

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

## AirDrop

Die Quick-Settings-Kachel schaltet den Empfang ein oder aus; ihr Pfeil öffnet
**Dateien senden …**. AirDrop startet ausgeschaltet. Empfangene Dateien benötigen
eine Bestätigung und landen im XDG-Downloads-Verzeichnis; vorhandene Dateien
werden nicht überschrieben.

Erforderlich sind Python ≥ 3.11, libadwaita ≥ 1.5 und ein bereits laufendes
`awdl0` mit lokaler IPv6-Adresse, etwa über OWL mit geeigneter WLAN-Hardware.
LightOS installiert keine Funkdienste oder Treiber.

Fedora:

```bash
sudo dnf install python3-libarchive-c python3-zeroconf python3-gobject gtk4 libadwaita openssl
```

Debian/Ubuntu:

```bash
sudo apt install python3-libarchive-c python3-zeroconf python3-gi gir1.2-gtk-4.0 gir1.2-adw-1 openssl
```

Die Firewall muss mDNS und TCP 8771 auf der AWDL-Schnittstelle zulassen;
LightOS verändert keine Firewall-Regeln. Am Apple-Empfänger AirDrop auf
**Für jeden** stellen. Bluetooth-Wecksignal und **Nur Kontakte** sind nicht
implementiert. Ein Funktransfer zu echten Apple-Geräten ist bisher ungeprüft;
die normale Test-VM besitzt keine AWDL-Hardware.
Details zur [Implementierung und Quellherkunft](../extension/airdrop/README.md).

## Deaktivierung

```bash
gnome-extensions disable lightos@lightos.dev
```

LightOS entfernt seine Panel-Elemente und stellt die verwalteten Farb-, App-,
Schrift- und Tastenkürzeleinstellungen wieder her. Ursprüngliche Werte liegen
unter `~/.local/state/lightos-gnome/`. Nachträgliche Benutzeränderungen werden
respektiert; eigene CSS-Regeln bleiben erhalten. Laufende AirDrop-Vorgänge enden.

Für Entwicklung: [Architektur und Build](architecture.md),
[VM-Zugang und Prüfung](vm-access.md), [Quellnachweise](../THIRD_PARTY.md).
