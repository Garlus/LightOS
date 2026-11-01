# Oma Cast: native GNOME-Suche in LightOS

Referenz: [typecraft-dev/oma-cast](https://github.com/typecraft-dev/oma-cast),
Revision `582bc73466ca25903630d2ebe76c4d63f7b86a68`, geprüft am 1. November 2026.

Oma Cast ist ein Launcher für Omarchy 4, Hyprland und Quickshell/QML. Diese
Laufzeitumgebung ist keine GNOME-Shell-Erweiterung. LightOS ersetzt seine bisherige
Teilstringsuche durch eine eigenständige GJS-Implementierung der dokumentierten
Oma-Cast-Bedienkonzepte. `Super + Leertaste` bleibt der Einstiegspunkt.

## Umfang

| Funktion | LightOS-Integration |
|---|---|
| Adaptive Suche | Präfixe, Mehrwortsuche, Initialen, Teilsequenzen und einzelne Schreibfehler; explizite Aliase und gelernte Suchbegriffe haben Vorrang. |
| Nutzungshäufigkeit | Häufigkeit und zeitlicher Abstand beeinflussen die Rangfolge; Favoriten erhalten einen Zusatzwert. |
| Aktionen | `Strg K` oder die Schaltfläche „Aktionen“: Öffnen, neues App-Fenster, Favorit, Alias, Ausblenden. |
| Schnellwahl | `Strg 1` bis `Strg 7` aktiviert sichtbare Treffer; `Umschalt Enter` öffnet ein neues App-Fenster. |
| Navigation | Pfeiltasten, Tab, `Strg N/P`; Pfeil nach oben bei leerem Feld ruft die letzte ausgeführte App-/Befehlssuche ab. |
| GNOME-Befehle | LightOS-Einstellungen, fünf Farbpaletten, Hell/Dunkel/System, Sperren und GNOME-Bildschirmaufnahme. |
| Bestehende Anbieter | Offene Fenster, lokale zuletzt verwendete Dateien, GNOME-D-Bus-Suchanbieter, Rechner und HTTP(S)-Adressen. |
| Web-Rückfall | DuckDuckGo bei freien Ergebnisplätzen. Erst die ausdrückliche Aktivierung öffnet die Suchadresse im Standardbrowser. |
| Rücknahme | „Ausgeblendete Treffer wieder anzeigen“ und „Suchverlauf zurücksetzen“ bleiben stets auffindbare Verwaltungsbefehle. |

Die 400 Omarchy-Menüaktionen, Hyprland-IPC, QML-Fenster und der Omarchy-Agentenstart
werden nicht installiert. Es gibt keinen zusätzlichen Suchdienst, keinen Rust-
oder Qt-Zwang und keine Modellausführung durch den Launcher. Rechner- und
Provider-Ergebnisse sind weiterhin nutzbar, aber keine personalisierbaren Befehle.

## Darstellung und Lebenszyklus

Die Oberfläche nutzt `ModalDialog`, `St.Entry`, `St.Button` und die vorhandenen
GNOME-Klassen `search-entry`, `list-search-result`, `message-dialog-title` und
`run-dialog-description`. Der genehmigte kompakte Suchdialog bleibt 560 Pixel
breit, auf kleinen Monitoren begrenzt. Es werden keine zusätzlichen CSS-Regeln,
Schriftgrößen, Widgetradien oder Top-Bar-Elemente eingeführt. Die Darstellung folgt
der ausgewählten LightOS-Farbpalette und GNOMEs Hell-/Dunkelmodus.

Lokale Ergebnisse erscheinen vor den asynchronen D-Bus-Antworten. Ergebnisse
abgebrochener Anfragen werden anhand einer Seriennummer verworfen. Der Wechsel
ins Aktionsmenü, das Schließen und `disable()` beenden laufende Anfragen und Timer.
Ein ausgefallener GNOME-Anbieter blockiert weder Apps noch Befehle.

## Speicherung und Datenschutz

`$XDG_STATE_HOME/lightos-gnome/search.json` enthält ausschließlich App-/Befehls-IDs,
Favoriten, Aliase, ausgeblendete IDs, Zähler, Zeitstempel und die Suchbegriffe
explizit ausgeführter Apps/Befehle. Die Datei wird atomar mit privaten Dateirechten
geschrieben. Grenzen: 512 Einträge, 16 Begriffe je Eintrag, 30 Verlaufsbegriffe,
40 Zeichen je Alias, 80 Zeichen je gespeichertem Suchbegriff, 1 MiB beim Laden.
Bei Überschreitung des UTF-8-Bytebudgets werden ältere gelernte Begriffe verworfen;
Favoriten und Aliase bleiben erhalten.
Beschädigte Daten führen zu leerem Suchzustand; ein Schreibfehler verhindert keine
App-Aktivierung. Deaktivierung entfernt den persönlichen Suchzustand nicht.

Dateinamen, Fenstertitel, Rechnerausdrücke, Web- und direkte URL-Aufrufe werden
nicht durch diese Personalisierung gespeichert. Bestehende aktivierte GNOME-
Suchanbieter erhalten Suchbegriffe weiterhin nach den GNOME-Sucheinstellungen.

## Herkunft und Lizenzgrenze

Der geprüfte Upstream-Stand enthält keine Lizenzdatei für `plugin/` (QML und
JavaScript). Die Lizenz im Rust-Unterprojekt `search/` ist keine Freigabe des
übrigen Repositories. LightOS übernimmt daher keine Upstream-Quelldateien,
Algorithmenimplementierungen, Grafiken oder Binärdateien. Die Referenz dient der
Funktionsbeschreibung; die GJS-Implementierung steht unter der Projektlizenz
GPL-3.0. Eine wörtliche Quellcodeportierung erfordert zuerst eine entsprechende
Lizenzfreigabe des Upstream-Projekts.

Prüfnachweise: [Suchvalidierung](search-validation.json),
[App-Suche](screenshots/gnome/oma-search-apps.png),
[Aktionen](screenshots/gnome/oma-search-actions.png),
[Aliase](screenshots/gnome/oma-search-alias.png),
[Darstellungsbefehle](screenshots/gnome/oma-search-commands.png).

Weitere Laufzeitaufnahmen: [Favorit mit Alias](screenshots/gnome/oma-search-favorite.png),
[Rechner](screenshots/gnome/oma-search-calculator.png),
[Dateisuche](screenshots/gnome/oma-search-files.png),
[Web-Rückfall](screenshots/gnome/oma-search-web.png),
[Dunkle Darstellung](screenshots/gnome/oma-search-dark.png).

Reproduktion nach Installation und VM-Sitzungsneustart:

```bash
python3 tools/test-vm.py
python3 tools/validate-search.py --enable-eval
```

Der zweite Befehl aktiviert Shell Eval ausschließlich über Looking Glass in der
isolierten VM und deaktiviert es nach der Prüfung wieder. Suchzustand und
Darstellungseinstellungen werden zurückgesetzt. Die Modultests verwenden
getrennte XDG-Verzeichnisse und ein speicherbasiertes GSettings-Backend.
