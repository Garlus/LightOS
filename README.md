# LightOS

Eine umfangreiche, installierbare **GNOME-Shell-Erweiterung für GNOME 50 / Wayland**: Top Bar, Suche, sechs Farbpaletten in Hell und Dunkel und gemeinsame Farben für GNOME und weitere Apps. Standard ist Ocean mit Blau und Türkis. Entwickelt und geprüft in einer separaten Fedora-44-VM.

![LightOS unter GNOME](docs/screenshots/gnome/cleanup-desktop.png)

Die Top Bar übernimmt LightOS' Anordnung: Systemmenü und aktive Anwendung links, native GNOME-Uhr mittig, Tray und native Systemsteuerung rechts. Der kleine Orb ist ein symbolisches GNOME-Icon. GNOMEs Übersicht bleibt über Super und das Systemmenü erreichbar. Die rechte Seite enthält keine laufenden App-Icons und keine Lupe. Die Suche öffnet sich über Super + Leertaste.

Systemmenü, App-Menü, Kalender, Benachrichtigungen, Quick Settings und Einstellungen verwenden GNOMEs eigene Komponenten. Das App-Menü bietet Fensterwechsel und Schließen; GNOME bietet kein universelles globales GTK-Menü für alle GTK-Anwendungen. StatusNotifier-/DBusMenu-Anwendungen erhalten native GNOME-Menüs. Ein bereits vorhandener StatusNotifierWatcher wird mitbenutzt.

## Installation

Das Projekt enthält ausschließlich die GNOME-Erweiterung, ihre Tests und Entwicklungswerkzeuge. Es benötigt weder Plasma noch KWin. Das bisherige Plasma-Setup und der systemweite Desktop-Installer sind entfernt.

```bash
python3 tools/build.py
gnome-extensions install --force dist/lightos@lightos.dev.shell-extension.zip
```

Danach unter Wayland einmal ab- und anmelden, damit GNOME die neue Erweiterung erkennt:

```bash
gnome-extensions enable lightos@lightos.dev
gnome-extensions prefs lightos@lightos.dev
```

Die Erweiterungsinstallation benötigt kein sudo und richtet keine Dienste ein. Für die native GTK4-Terminaloberfläche wird **Ptyxis** verwendet, auf Fedora GNOME standardmäßig verfügbar. Falls es fehlt: `sudo dnf install ptyxis`, anschließend `ptyxis` starten. Die Erweiterung liefert und wählt dessen Farbpaletten; das bisherige GTK3-GNOME-Terminal bleibt ebenfalls unterstützt. Das ZIP enthält Layout, Suche, Farbpaletten und App-Anbindung. GNOME 49 und andere Shell-Versionen werden bisher nicht als kompatibel deklariert.

## AirDrop

Quick Settings enthält eine native **AirDrop-Kachel**. Ein Klick schaltet den Empfang an oder aus; der separate Pfeil öffnet **„Dateien senden …“**. Standard ist Aus, auch nach einem Sitzungsneustart. Der Versanddialog wählt mehrere lokale Dateien, findet empfangsbereite Geräte über mDNS und zeigt die Übertragungsphase mit Abbrechen-Option. Beim Öffnen des Versanddialogs wird AirDrop eingeschaltet, sofern die Voraussetzungen erfüllt sind. Eingehende Dateien brauchen eine Annahmebestätigung und landen im XDG-Downloads-Ordner; vorhandene Dateien werden nicht überschrieben. Beim Deaktivieren der Erweiterung enden Empfang und laufender Versand.

Die HTTPS-/DVZip-Empfangsschicht stammt aus [Omdrop](https://github.com/brentkearney/omdrop-plugin); Lizenz und feste Quellrevision sind im ZIP enthalten. Die Funkanbindung benötigt ein bereits laufendes **`awdl0` mit lokaler IPv6-Adresse**, etwa durch [OWL](https://github.com/seemoo-lab/owl) mit geeigneter WLAN-Hardware oder einen AWDL-Treiber. OWL braucht direkten Zugriff auf eine WLAN-Karte; eine normale VM ohne WLAN-Durchreichung bietet das nicht. [OpenDrop](https://github.com/seemoo-lab/opendrop) dient als weitere Protokollreferenz. LightOS verwendet keine Broadcom-spezifischen Firmware-Peertabellen und installiert keine Treiber oder Funkdienste automatisch.

Zusätzliche Fedora-Abhängigkeiten: `sudo dnf install python3-libarchive-c python3-zeroconf python3-gobject gtk4 libadwaita openssl`. Für Debian/Ubuntu heißen die entsprechenden Pakete `python3-libarchive-c python3-zeroconf python3-gi gir1.2-gtk-4.0 gir1.2-adw-1 openssl`. Benötigt werden Python ≥ 3.11 und libadwaita ≥ 1.5. Fehlendes AWDL oder fehlende Protokollbibliotheken ergeben einen Hinweis; die Kachel bleibt Aus. Eine aktive Firewall muss mDNS sowie TCP 8771 auf der AWDL-Schnittstelle zulassen. Die Erweiterung verändert keine Firewall-Regeln.

Am Apple-Empfänger AirDrop öffnen und **„Für jeden“** aktivieren. Ein Bluetooth-Wecksignal und eine Oberfläche für „Nur Kontakte“ sind bisher nicht enthalten. Apple-Identitäten werden nicht automatisch bezogen. Empfangs-, Dialog- und lokale TLS-Übertragungstests sind in der GNOME-VM geprüft; ein Funktransfer zu einem echten iPhone/Mac bleibt ohne geeignete Hardware ungeprüft. [Aufnahmen und Prüfbericht](docs/airdrop-validation.md), [Architektur und Quellherkunft](extension/airdrop/README.md).

## Farben und Apps

Standard ist **Ocean, hell**: Blau `#2672af` und Türkis `#0a6f75`; dunkel `#70b9ee` und `#5bd0d6`. Weitere Paletten: Grove, Ember, Iris, T3 Chat und T3 Code. Alle sechs bieten Hell und Dunkel. „System“ stellt die ursprüngliche GNOME-Darstellung wieder her und folgt anschließend GNOMEs Farbpräferenz. Das Systemmenü bietet die Farbwahl, Quick Settings einen Hell-/Dunkel-Schalter.

Die vollständigen Farbdaten stammen aus [t3codes gemeinsamer Paletten-Datei](https://github.com/pingdotgg/t3code/blob/e803242d936af3e052757d59ab32bc7c4fcc2390/packages/shared/src/themePalettes.ts), Revision `e803242d936af3e052757d59ab32bc7c4fcc2390`. OKLCH-Farben wurden nach sRGB umgerechnet. Lizenz und Herkunft sind im ZIP enthalten.

| Anwendung | Anbindung |
|---|---|
| GTK 3 / GTK 4 / libadwaita | Farbvariablen in der benutzerspezifischen GTK-CSS; GTK 3 erhält zusätzlich ausschließlich Farbangaben für Fenster und Headerbars |
| Dateien, Einstellungen, Rechner, Erweiterungseinstellungen | Dieselbe GTK-/libadwaita-Palette |
| GNOME Texteditor / GtkSourceView 5 | Zwölf Farbschemata, native Adwaita-Syntaxbasis, automatische Auswahl im Texteditor |
| Ptyxis (GTK 4 / libadwaita) | Zwölf native Terminalpaletten einschließlich Titelzeile, Cursor und ANSI-Farben; Auswahl im vorhandenen Standardprofil |
| GNOME Terminal (GTK 3) | Farben des bestehenden Standardprofils, Cursor und Auswahl, passende native Hell-/Dunkeldarstellung |
| GNOME Console 50 | Hell-/Dunkelmodus; eigene Terminalpalette bleibt erhalten |
| KDE / Qt | Native `.colors`-Palette und Farbgruppen in `kdeglobals`; vorhandene KDE-App-Konfigurationen wählen sie explizit. Qt5ct/Qt6ct erhält eine native Farbpalette. Widget-Stil und Font bleiben erhalten |
| KWrite / Kate | Native Syntax-Themes aus dem vorhandenen Schema; nur Farben werden abgeleitet, Formatierung und Fonts bleiben erhalten |
| VS Code / VSCodium / Code OSS / Insiders | Oberfläche, Editor und Terminal über `workbench.colorCustomizations`, auch Benutzerprofile; vorhandenes Theme und andere Einstellungen bleiben erhalten |
| Flatpak-GTK-Apps | Farbregeln in vorhandenen privaten `.var/app/<App-ID>/config/gtk-{3,4}.0/gtk.css` ohne zusätzliche Sandbox-Rechte |
| Flatpak-KDE/Qt und Code | Entsprechende private App-Konfigurationen, wenn vorhanden bzw. für bekannte KDE/Qt-App-IDs |
| Andere GTK-Apps | Übernehmen die Palette, soweit sie die Systemfarben verwenden |

**Radien, Padding, Margins, Schriftgrößen, Icons und Fensterknöpfe der Apps werden nicht geändert.** GNOME behält seine Formen und Abstände. Neue Farben werden für GTK-Apps nach einem Neustart der jeweiligen App wirksam; einige Apps aktualisieren ihren Stil schon während des Wechsels.

Die Erweiterung nutzt jetzt die dokumentierten Farb-Schnittstellen von GTK, KDE/Qt und VS Code. Andere Electron-Apps und Webseiten brauchen eigene Farb-Schnittstellen; eine universelle Schnittstelle für alle privaten App-Themes gibt es nicht. Erst neu gestartete Apps werden automatisch auf neue Konfigurationsordner geprüft. GTK-/Qt-/Flatpak-Apps anschließend bei Bedarf neu öffnen. Flatpak-Berechtigungen werden nicht verändert. GNOME Console 50 verwirft eigene Paletten aufgrund eines [Fehlers im GVariant-Iterator](https://github.com/GNOME/console/blob/gnome-50/src/kgx-livery-manager.c#L307); Ptyxis ist die geprüfte GTK4-Alternative für vollständige Terminalfarben. Tray-Icons, die ausschließlich Pixmap-Daten liefern, erhalten derzeit ein Ersatzicon; Icons über Namen werden unterstützt.

## Suche statt KRunner

**Super + Leertaste** öffnet einen kompakten Suchdialog mit GNOMEs eigenen Komponenten:

- Apps starten und offene Fenster wechseln.
- Zuletzt verwendete lokale Dateien öffnen.
- GNOMEs aktivierte Suchanbieter verwenden, unter anderem Dateien, Einstellungen und Rechner.
- Arithmetik mit Klammern, Potenzen, Modulo und Dezimalzahlen berechnen; Enter kopiert das Ergebnis.
- HTTP-/HTTPS-Adressen im Standardbrowser öffnen.
- Pfeiltasten und Tab wählen, Enter aktiviert, Esc und Außenklick schließen.

Der Dialog heißt „Suche“. Eine unbenutzte Buttonzeile ist ausgeblendet; dadurch fällt der zusätzliche Abstand unter dem Bedienhinweis weg.

Die Suche verwendet keine Shell-Ausführung und kein JavaScript-`eval()` für Berechnungen. Externe Suchanbieter werden parallel aufgerufen, abgebrochene Suchläufe verworfen. Die Liste respektiert GNOMEs Suchanbieter- und Jugendschutzeinstellungen. Dateisuche außerhalb der zuletzt verwendeten Dateien benötigt einen aktivierten GNOME-Dateisuchanbieter und dessen Index.

[Search Light](https://github.com/icedman/search-light) und [Ulauncher](https://ulauncher.io/) wurden als Alternativen betrachtet. Die integrierte Suche benötigt keinen zweiten Launcher und wird mit demselben ZIP installiert.

## Wiederherstellung

```bash
gnome-extensions disable lightos@lightos.dev
```

Das entfernt die Panel-Elemente, stellt Aktivitäten und native Shell-Farben wieder her, entfernt verwaltete GTK-Farbblöcke und setzt verwaltete App-Einstellungen und Farbschemata zurück. Ursprüngliche Daten liegen bis dahin unter `~/.local/state/lightos-gnome/`. Qt-Farbeinstellungen und verwaltete Code-Farbwerte werden ebenfalls wiederhergestellt. Eigene CSS-Regeln bleiben erhalten, auch wenn sie während der Nutzung ergänzt wurden. Nachträglich abweichend geänderte App-Einstellungen werden nicht überschrieben. Die Sicherungen überstehen einen Shell-Neustart.

Super + Leertaste ist bei GNOME häufig mit dem Tastaturlayout-Wechsel belegt. Die Erweiterung sichert die kollidierende Belegung, lässt andere Layout-Shortcuts stehen und stellt die ursprüngliche Belegung beim Deaktivieren wieder her.

## VM-Prüfung und Aufnahmen

**Selbst testen:** `python3 tools/vm-view.py` öffnet die bestehende Test-VM im
Browser. [Zugriff, Bedienung und Terminalbefehle](docs/vm-access.md).

Siehe [Prüfbericht und alle Farbvarianten](docs/gnome-validation.md). VM-Steuerung: `python3 tools/vm.py ssh|capture|key|click|install|start|stop`. Die VM nutzt SSH `127.0.0.1:2233`, VNC `127.0.0.1:5910` und QMP unter `.cache/vm-gnome/`. Die validierte VM verwendet eine bestehende QCOW2-Basis unter `.cache/`. Diese Basisdateien dürfen während des Betriebs nicht verändert oder gelöscht werden. Die Werkzeuge installieren und bedienen ausschließlich GNOME in der VM.

`tools/validate-vm.py` ist ein Testwerkzeug für diese VM. Es benötigt GNOMEs Eval-Funktion im VM-Entwicklermodus; sie wird für die finale Sitzung wieder deaktiviert. Die installierbare Erweiterung benötigt diesen Modus nicht.

## Projekt und Entwicklung

| Pfad | Inhalt |
|---|---|
| `extension/` | Installierbare GNOME-Erweiterung, Einstellungen, Paletten und optionale App-Farbadapter |
| `tools/` | ZIP-Build, VM-Steuerung, Tests und visuelle Validierung |
| `tests/` | Rechnen, Farbregeln, App-Anbindung, Wiederherstellung und GTK-Geometrie |
| `docs/` | Prüfberichte und echte GNOME-VM-Aufnahmen |
| `dist/` | Erzeugtes Extension-ZIP |

`python3 tools/test-vm.py` synchronisiert den GNOME-Projektstand und führt die isolierten GJS-Tests in der VM aus. Dabei werden temporäre XDG-Verzeichnisse und ein GSettings-Speicherbackend verwendet. [Architektur und Erweiterung der App-Anbindung](docs/architecture.md), [Projektbereinigung](docs/project-cleanup.md).

## Appearance und ChromaLeon

Der Einstellungsreiter **Appearance** bietet die drei Darstellungen System,
Hell und Dunkel und die bisherigen sechs T3-Code-Themes. Die dritte Theme-Zeile
enthält **höchstens drei Farben aus dem aktuellen Hintergrundbild**. Eine
Auswahl in dieser Zeile aktiviert die zusätzliche ChromaLeon-Engine; ein Klick
auf eine vorhandene Palette wechselt zurück zu T3 Code. Standard bleibt Ocean.
Die Farben werden lokal berechnet; pro Hintergrundbild kann eine Auswahl
behalten werden.

Die Integration verwendet ChromaLeons echte Farbextraktion, Kontrastanpassung,
Farbmischung, GTK- und Shell-Farbtemplates und optionale SVG-Einfärbung.
GNOMEs eigene Größen, Radien, Abstände, Schrift und Widget-Icons bleiben erhalten.
Die optionalen Symbol-Einstellungen färben bestehende SVG-Symbole ein und sind
standardmäßig aus. MoreWaita benötigt ein bereits vorhandenes Symbolpaket.

Der Tab enthält außerdem GNOME-Akzentfarben, hellen Shell-Stil, durchgehend
helle Leiste, separate Shell-/Panel-/App-/GTK3-Schalter, vier Tint-Stärken,
dunklere Flächen, eigene Shell-Farbregeln, Hot Reload, Flatpak-Farben und eine
optionale Verknüpfung im Anwendungsraster. Eigene Stylesheets dürfen
`@@ACCENT@@` verwenden; die Integration übernimmt ausschließlich Farbregeln.
Hot Reload verwendet ChromaLeons Standard-Kontrastsignal und stellt dessen
vorherigen Wert sofort wieder her. Apps, die das Signal nicht verarbeiten,
müssen neu geöffnet werden. Flatpak-Berechtigungen werden nicht erweitert.

[Prüfbericht und laufende VM-Aufnahmen](docs/chromaleon-validation.md).
Die Farbauswahl verwendet native GNOME-Karten ohne eigene Kachelumrandung;
[Aktuelle Aufnahmen in Hell und Dunkel](docs/appearance-styling.md).

## Automatisch Hell und Dunkel wechseln

Im Reiter **Appearance** lässt sich „Bei Sonnenaufgang und Sonnenuntergang
wechseln“ aktivieren. Die Option ist standardmäßig aus. Tagsüber verwendet
LightOS die helle, nachts die dunkle Variante der gewählten T3- oder
ChromaLeon-Palette. Die Einstellungen zeigen die Standortbasis, die heutigen
Sonnenzeiten und den nächsten Wechsel.

Wenn GNOMEs Standortdienste aktiviert sind, fragt LightOS den Systemstandort
über **GeoClue** ab, mit der höchsten verfügbaren Genauigkeit. Dieser kann von
GPS oder anderen System-Standortquellen stammen. Ohne freigegebenen Standort,
verfügbares GeoClue oder GPS-Fix greift sofort die **grobe Zeitzonenschätzung**:
der Referenzort der Systemzeitzone aus den installierten IANA-Zeitzonendaten.
Eine Zeitzone deckt oft eine große Region ab; deren Sonnenzeiten können vom
wirklichen Wohnort deutlich abweichen. Bei einer reinen UTC-Versatz-Zeitzone
wird zusätzlich ein Ort am Äquator geschätzt. Es werden keine Standortdienste
aktiviert und keine Standortkoordinaten gespeichert.

Die Sonnenzeiten werden lokal aus Datum und Koordinaten berechnet. Sommerzeit,
Zeitzonenwechsel und Polartag/-nacht werden berücksichtigt. Nach dem Aufwachen
wird der Modus neu geprüft; Änderungen der Systemzeit werden spätestens bei
der nächsten Prüfung innerhalb einer Minute berücksichtigt. Eine manuelle
Hell-/Dunkelwahl, auch über GNOMEs Quick Settings, bleibt bis zum nächsten
Sonnenwechsel erhalten. Die Auswahl „System“ schaltet die Automatik aus.
Beim Deaktivieren von LightOS werden Timer und Standortabfrage beendet und
GNOMEs ursprüngliche Farbeinstellungen über die bestehenden Sicherungen
wiederhergestellt.

Die Sonnenformeln sind aus [Night Theme Switcher](https://gitlab.com/rmnvgr/nightthemeswitcher-gnome-shell-extension)
adaptiert, Revision `87ef3094137c7943b3d0a8fdf7420ea57827653b`, GPL-3.0-or-later.
Die GeoClue-Anbindung, Zeitzonenschätzung und Einbindung in LightOS sind separat
implementiert. [Herkunft und Anpassungen](extension/solar/SOURCES.json),
[VM-Prüfbericht und Aufnahmen](docs/solar-validation.md).

## Quellen und Übernahme anderer Projekte

LightOS enthält bewusst begrenzte Übernahmen; die ursprünglichen Projekte und
Autoren bleiben ausgewiesen. [THIRD_PARTY.md](THIRD_PARTY.md) dokumentiert
Revisionen, Dateien, lokale Anpassungen und die mitgelieferten Lizenzen.

| Projekt / Autor | Verwendung | Lizenz / Revision |
|---|---|---|
| [Night Theme Switcher · Romain Vigier / Contributors](https://gitlab.com/rmnvgr/nightthemeswitcher-gnome-shell-extension) | Sonnenformeln für den automatischen Darstellungsmodus | GPL-3.0-or-later · `87ef3094137c7943b3d0a8fdf7420ea57827653b` |
| [ChromaLeon · Fabito02](https://github.com/Fabito02/ChromaLeon) | Zusätzliche Farb-Engine, Hintergrundbild-Analyse, Templates und SVG-Farben | GPL-3.0-or-later; Shell-Templates mit ihren LGPL-2.1-Hinweisen · `b2c5cd2cf410c14c22278b894d04ab8d60f5eb59` |
| [Omdrop · Brent Kearney](https://github.com/brentkearney/omdrop-plugin) | AirDrop-Empfang, Identität und Zertifikate, mit LightOS-Anpassungen | MIT · `58fca678b08d3a7c875c83c7dfc2f0d3251cce44` |
| [t3code · T3 Tools Inc.](https://github.com/pingdotgg/t3code) | Sechs vorhandene Farbpaletten | MIT · `e803242d936af3e052757d59ab32bc7c4fcc2390` |
| [OWL · SEEMOO Lab](https://github.com/seemoo-lab/owl) | Externe AWDL-Voraussetzung / Referenz, kein Code im ZIP | GPL-3.0 · `da255a70f221784c836d943dd3f243bc798f223b` |
| [OpenDrop · SEEMOO Lab](https://github.com/seemoo-lab/opendrop) | AirDrop-Protokollreferenz, kein Code im ZIP | GPL-3.0 · `11fe7ba7861093b302bc0637e8cb10adf2d29337` |
| [noVNC](https://github.com/novnc/noVNC) | Lokaler VM-Browserzugang, separat unter `.cache/`, nicht im ZIP | MPL-2.0 · `a8dfd6a3ea3c74244f5ebdaa5a7f1023007a7820` |

Für Übernahmen empfiehlt sich: Lizenz und einzelne Datei-Hinweise prüfen,
Copyright-Hinweise behalten, eine feste Revision dokumentieren, Änderungen am
übernommenen Code kenntlich machen und eigene Adapter vom Fremdcode trennen.
Vor einer Aktualisierung helfen ein nachvollziehbarer Diff, Tests und ein
Review. Ein privates Repository ersetzt diese Herkunfts- und Lizenzangaben
nicht. Primäre Hinweise dazu: [GitHub: Code anderer wiederverwenden](https://docs.github.com/en/get-started/learning-to-code/reusing-other-peoples-code-in-your-projects)
und [GitHub: Repository lizenzieren](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).
