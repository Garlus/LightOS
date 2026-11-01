# Architektur von LightOS

LightOS wird als eine GNOME-Shell-Erweiterung mit stabiler UUID `lightos@lightos.dev` installiert. `extension/metadata.json` definiert GNOME 50 als geprüfte Shell-Version. Ein Update verwendet dieselbe UUID und dasselbe GSettings-Schema; bisherige Farbwahl und Wiederherstellungsjournale bleiben kompatibel.

## Komponenten

| Modul in `extension/` | Aufgabe |
|---|---|
| `extension.js` | Lebenszyklus, Einstellungen, Such-Tastenkürzel und Shell-Farben |
| `search.js`, `calculator.js` | Suchdialog, lokale Treffer, GNOME-Suchanbieter und sicherer Rechenparser |
| `palette.js`, `palettes/` | Fünf feste LightOS-Paletten, Migration älterer Auswahlen, Farbvariablen und GTK-CSS-Journal |
| `appThemes.js` | Koordiniert optionale App-Farben und native Editor-/Terminaleinstellungen |
| `terminalThemes.js` | Ptyxis-Paletten und dessen bestehendes Standardprofil |
| `extraThemes.js` | Farb-Schnittstellen für Qt/KDE-Apps, Code/VSCodium und private Flatpak-Konfigurationen |
| `systemMenu.js`, `systemStats.py` | Compact native panel menu, asynchronous read-only procfs/sysfs measurements and history graphs |
| `systemTools.py` | Separate GTK 4 / libadwaita process for Flatpak, Homebrew, bounded cache cleanup and Tesseract OCR |
| `workspaceMaximize.js` | Optional per-window workspace ownership and restoration on unmaximize, switch-off and extension disable |
| `tray.js` | StatusNotifier und DBusMenu mit nativen GNOME-Menüs |
| `prefs.js`, `schemas/` | Native Adwaita-Einstellungen und benutzerspezifisches GSettings-Schema |
| `windowCentering.js` | Tastenkürzel, Wayland-Größenbestätigung und bereinigbare Fensterbewegung |
| `fontRendering.js` | Optionales globales Schriftglättungsprofil mit persistentem, defaultbewusstem Rücknahmejournal |
| `fontProfile.js`, `fontAssets.js`, `fonts/` | Reversibler Wechsel zwischen Adwaita und dem Standard Geist / Geist Mono; benutzerspezifische Registrierung mitgelieferter OFL-Schriften |
| `interactionAnimations.js` | Optionale Druckrückmeldung an nativen Panel-/Quick-Settings-Actors, Eingabe- und Transform-Lifecycle |

Alle Farb-Anbindungen verwenden vorhandene App-Schnittstellen. Die Farb-Anbindungen enthalten keinen Plasma-/KWin-Unterbau, keinen nativen Desktop-Plugin-Build und keine systemweiten Style-, Schrift- oder Icon-Ersetzungen. Die Qt-/KDE-App-Anbindung unterstützt solche Anwendungen unter GNOME. Die `org.kde.StatusNotifier*`-Namen stammen aus dem Tray-Protokoll und erfordern keine Plasma-Sitzung.

Als ausdrücklich freigegebene, unabhängige Option kann LightOS 9 die globale
GNOME-Schriftglättung auf Graustufen ohne Hinting setzen. Das ist kein Bestandteil
der Farb-Anbindungen; Schriftfamilien und Schriftgrößen bleiben erhalten.
`font-rendering-backup.json` unter `~/.local/state/lightos-gnome/` unterscheidet
ursprüngliche Benutzerwerte von Schema-Standardwerten. Nur noch unverändert
LightOS-eigene Werte werden zurückgenommen. Druckrückmeldung verwendet temporäre
Actor-Transformationen, lässt native CSS-Maße unverändert und beendet alle
Eingabe-Hooks/Transformationen bei ausgeschalteten Systemanimationen.

Das freigegebene Schriftprofil (`font-profile`, Standard `geist`) arbeitet
getrennt von Farbanbindungen und Schriftglättung. Pango ersetzt nur die Familie
von `font-name`, `document-font-name` und `monospace-font-name`; Größen und Stile
bleiben erhalten. `font-profile-backup.json` sichert explizite Benutzerwerte und
ursprünglich ungesetzte Werte vor jeder Änderung. Ein expliziter Profilwechsel
übernimmt externe Änderungen als neue Wiederherstellungsbasis; Sitzungswiederaufnahme
und Deaktivierung respektieren externe Werte. Fontconfig erhält einen ausschließlich
LightOS gehörenden symbolischen Link unter `$XDG_DATA_HOME/fonts/lightos-geist`.
Fremde Dateien werden weder ersetzt noch entfernt. Gesperrte Rücknahmen bleiben
einschließlich Schriftregistrierung für eine spätere Wiederherstellung erhalten.
Externe Schriftwerte mit Geist behalten ebenfalls die benötigte Registrierung.

Die Top Bar bleibt GNOME-nativ. `extension.js` ersetzt weder die
Activities-Schaltfläche. Neben den StatusNotifier-Einträgen aus `tray.js`
trägt sie das ausdrücklich beauftragte System-Icon aus `systemMenu.js` direkt
links neben Quick Settings ein. Quick Settings, Kalender und Benachrichtigungen
behalten ihre nativen Widgets. Nur das eigene Systemmenü verwendet kompakte
Zeilenabstände; globale Widgetmaße bleiben unverändert.

## Weitere Apps anbinden

Neue Anbindungen gehören in die App-Module oder in ein separates Modul mit `apply(palette, mode)` und `restore()`. Sie müssen fehlende Apps und Schemas überspringen, ausschließlich Farben verändern, vor Änderungen den Originalzustand sichern und Benutzeränderungen bei der Wiederherstellung respektieren. Journale liegen unter `~/.local/state/lightos-gnome/` und überstehen einen Sitzungsneustart.

Palettenrollen kommen aus den JSON-Dateien in `extension/palettes/`; Werte werden nicht aus Widgetmaßen oder Styles abgeleitet. Native Syntaxbasen für KWrite/Kate liegen einschließlich Herkunft und MIT-Lizenz in `extension/native/`. Sie erhalten ihre Formatierung und werden nur farblich angepasst.

## Build und Prüfung

```bash
python3 tools/build.py
python3 tools/test-vm.py
```

Der Build verpackt die Inhalte von `extension/` direkt an die Wurzel des GNOME-Extension-ZIP. Die Teststeuerung synchronisiert ausschließlich den Projektstand in die isolierte VM; das Host-Desktopprofil wird nicht verändert. Interaktive Prüfung und Aufnahmen erfolgen über `tools/vm.py` und `tools/validate-vm.py`. Vor einer neuen visuellen Prüfung muss die VM das aktuelle ZIP verwenden.

`tools/validate-vm.py` prüft die native GNOME-Top-Bar samt Quick Settings und Kalender. Es erwartet eine sichtbare Activities-Schaltfläche und keine LightOS-Indikatoren außer StatusNotifier-Einträgen; eigene Menüs und Ausblendungen der Top Bar existieren nicht.

## Adaptive Suche

`search.js` verbindet GNOME-Apps, Fenster, Rechner, zuletzt verwendete Dateien und D-Bus-Suchanbieter mit nativen ModalDialog-/St-Widgets. `searchModel.js` implementiert Matching und adaptive Rangfolge ohne GNOME-Abhängigkeiten; `searchStore.js` begrenzt und speichert den persönlichen Zustand atomar. Die Suchaktion erhält die Extension-Instanz für GSettings und Einstellungen. Oma Cast dient als dokumentierte Bedienreferenz, ohne Übernahme unlizenzierter Quelldateien. Siehe [Integrationsbericht](oma-cast.md).

## Panelhöhe und Shell-Darstellung

`panel-height-42` ist eine unabhängige GSettings-Option (Standard `false`). Nur
bei Aktivierung ergänzt das verwaltete Stylesheet `height: 42px` für `#panel`;
die native Layoutverwaltung aktualisiert daraus Struts und Arbeitsbereich. Das
Entfernen des Stylesheets nimmt die Höhe zurück. Beide Farb-Engines verwenden
im hellen Modus eine weiße Top Bar mit schwarzem Text und helle Menüvarianten.
Quick Settings und Kalender behalten ihre nativen Radien, Abstände und
Schriftmetriken. `tools/validate-shell-layout.py` prüft alle fünf Paletten, beide
ChromaLeon-Varianten, Panelhöhe und Rücknahme gegen GNOMEs native Geometrie.

## Vollständig helle Übersicht und Suche ohne Vignette

Die festen Paletten erhalten im hellen Modus dieselbe vollständig helle
GNOME-Farbvorlage wie ChromaLeon. `shellCss()` filtert sie weiterhin durch
`colorOnly()`; anschließend folgen die palettenspezifischen Farben. So werden
auch die im nativen Light-Stylesheet noch dunklen Overview-, Dash-, App-Raster-
und Ordnerflächen hell. Abstände, Radien und Schriftmetriken bleiben nativ; die
Farbregeln werden mit dem verwalteten Stylesheet zurückgenommen.

`LightSearch` entfernt ausschließlich die eigene radiale Lightbox direkt nach
der Dialogkonstruktion. Der native ModalGrab bleibt erhalten. Der transparente,
monitorfüllende GNOME-Dialogcontainer fängt Außenklicks ab; die Koordinatenprüfung
verwendet das sichtbare innere Dialogfeld. GNOMEs interner Event-Blocker bleibt
ebenfalls erhalten. Ein Außenklick schließt die Suche, ohne die Anwendung
darunter zu bedienen. `tools/validate-overview.py` prüft alle Farb-Engines und vergleicht
Hintergrundpixel vor/nach dem Öffnen in beiden Darstellungsmodi.
