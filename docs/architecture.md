# Architektur von LightOS

LightOS wird als eine GNOME-Shell-Erweiterung mit stabiler UUID `lightos@lightos.dev` installiert. `extension/metadata.json` definiert GNOME 50 als geprüfte Shell-Version. Ein Update verwendet dieselbe UUID und dasselbe GSettings-Schema; bisherige Farbwahl und Wiederherstellungsjournale bleiben kompatibel.

## Komponenten

| Modul in `extension/` | Aufgabe |
|---|---|
| `extension.js` | Panel-Elemente, Lebenszyklus, Einstellungen und GNOMEs native Aktionen |
| `search.js`, `calculator.js` | Suchdialog, lokale Treffer, GNOME-Suchanbieter und sicherer Rechenparser |
| `palette.js`, `palettes/` | Sechs feste T3-Paletten, Farbvariablen und GTK-CSS-Journal |
| `appThemes.js` | Koordiniert optionale App-Farben und native Editor-/Terminaleinstellungen |
| `terminalThemes.js` | Ptyxis-Paletten und dessen bestehendes Standardprofil |
| `extraThemes.js` | Farb-Schnittstellen für Qt/KDE-Apps, Code/VSCodium und private Flatpak-Konfigurationen |
| `tray.js` | StatusNotifier und DBusMenu mit nativen GNOME-Menüs |
| `prefs.js`, `schemas/` | Native Adwaita-Einstellungen und benutzerspezifisches GSettings-Schema |
| `windowCentering.js` | Tastenkürzel und App-Menü-Aktion, Wayland-Größenbestätigung und bereinigbare Fensterbewegung |
| `fontRendering.js` | Optionales globales Schriftglättungsprofil mit persistentem, defaultbewusstem Rücknahmejournal |
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

## Weitere Apps anbinden

Neue Anbindungen gehören in die App-Module oder in ein separates Modul mit `apply(palette, mode)` und `restore()`. Sie müssen fehlende Apps und Schemas überspringen, ausschließlich Farben verändern, vor Änderungen den Originalzustand sichern und Benutzeränderungen bei der Wiederherstellung respektieren. Journale liegen unter `~/.local/state/lightos-gnome/` und überstehen einen Sitzungsneustart.

Palettenrollen kommen aus den JSON-Dateien in `extension/palettes/`; Werte werden nicht aus Widgetmaßen oder Styles abgeleitet. Native Syntaxbasen für KWrite/Kate liegen einschließlich Herkunft und MIT-Lizenz in `extension/native/`. Sie erhalten ihre Formatierung und werden nur farblich angepasst.

## Build und Prüfung

```bash
python3 tools/build.py
python3 tools/test-vm.py
```

Der Build verpackt die Inhalte von `extension/` direkt an die Wurzel des GNOME-Extension-ZIP. Die Teststeuerung synchronisiert ausschließlich den Projektstand in die isolierte VM; das Host-Desktopprofil wird nicht verändert. Interaktive Prüfung und Aufnahmen erfolgen über `tools/vm.py` und `tools/validate-vm.py`. Vor einer neuen visuellen Prüfung muss die VM das aktuelle ZIP verwenden.
