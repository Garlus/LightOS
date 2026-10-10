# AirDrop in LightOS – VM-Prüfung

Geprüft am 9. Oktober 2026 unter Fedora 44, GNOME Shell 50.5 / Wayland.
Installierter Stand: LightOS Version 4, aus dem aktuellen Extension-ZIP.
Jede Quellaktualisierung wurde mit `python3 tools/build.py` gebaut, mit
`python3 tools/vm.py install` installiert und durch einen VM-Sitzungsneustart
geladen. Auf dem Host wurde keine Desktop-Installation vorgenommen.

## Ergebnis und Grenzen

Die native Kachel schaltet den Empfang und besitzt einen separaten Menü-Pfeil.
Das Menü öffnet den GTK4-/libadwaita-Versanddialog. Die Standardeinstellung ist
Aus. Zum Senden werden mehrere Dateien ausgewählt und ein entdecktes Gerät
angeklickt. Der Empfang braucht eine explizite Bestätigung.

Alle **814 automatisierten Checks** bestanden: 456 GNOME-Checks, 299 Prüfungen
der GTK4-Terminalanbindung, 49 weitere App-Farbprüfungen und 10 AirDrop-Tests.
Die AirDrop-Tests benutzen echte lokale TLS-Verbindungen, binäre Plists,
CPIO/DVZip und den mitgelieferten Empfangsserver. Die automatisierte
Bestätigung liefert ausschließlich der Testprozess; die Produktionsoberfläche
zeigt den unten aufgenommenen Annahmedialog.

Die VM besitzt lediglich Ethernet. Für die interaktive Transportprüfung wurde
vorübergehend ein virtuelles `awdl0` angelegt. Ein lokaler TLS-Testempfänger
wurde über echtes IPv6-mDNS entdeckt; zwei über den nativen Dateidialog gewählte
Dateien wurden als eine Übertragung gesendet. `cmp` bestätigte beide Inhalte.
Ein lokaler Testsender übertrug anschließend eine Datei in den realen
LightOS-Empfangsdienst; nach „Annehmen“ stimmte die Datei im Downloads-Ordner
bytegenau mit dem Original überein. Ein vorhandener Name erhielt einen Suffix.

**Diese Aufnahmen belegen keinen Funktransfer zu einem Apple-Gerät.** Die
virtuelle Schnittstelle ersetzt keine AWDL-fähige WLAN-Karte. OWL/native AWDL,
BLE-Verhalten, ein echtes iPhone/Mac und dessen aktuelle AirDrop-Kompatibilität
bleiben ungeprüft. LightOS enthält kein Bluetooth-Wecksignal; AirDrop am
Apple-Empfänger öffnen und „Für jeden“ wählen. Voraussetzungen und Quellherkunft
stehen in [README](../README.md#airdrop) und
[AirDrop-Architektur](../extension/airdrop/README.md).

## Aufnahmen aus der laufenden GNOME-VM

| Verhalten | Aufnahme |
|---|---|
| Native Kachel, Standard Aus | [Aus](screenshots/gnome/airdrop-off.png) |
| An, echter Empfangsdienst auf der virtuellen Testschnittstelle | [An – lokaler Transporttest](screenshots/gnome/airdrop-on-transport-test.png) |
| Separater Pfeil mit „Dateien senden …“ | [Menü](screenshots/gnome/airdrop-menu.png) |
| Nativer Dateidialog mit Mehrfachauswahl | [Dateiauswahl](screenshots/gnome/airdrop-file-chooser.png) |
| Zwei Dateien und per mDNS gefundener VM-Testempfänger | [Versanddialog](screenshots/gnome/airdrop-send-dialog.png) |
| Warten auf Bestätigung, Aktivitätsanzeige und Abbrechen | [Warten](screenshots/gnome/airdrop-send-waiting.png) |
| Benutzerabbruch, ohne neue Datei beim Testempfänger | [Abgebrochen](screenshots/gnome/airdrop-send-cancelled.png) |
| Erfolgreicher Versand, Inhalte mit `cmp` geprüft | [Gesendet](screenshots/gnome/airdrop-send-success.png) |
| Explizite Zustimmung zu einer eingehenden Datei | [Annahmeabfrage](screenshots/gnome/airdrop-receive-confirmation.png) |
| Empfang in Downloads abgeschlossen | [Empfangen](screenshots/gnome/airdrop-receive-success.png) |
| Fehlende Funkvoraussetzung, Kachel bleibt Aus | [Kein AWDL](screenshots/gnome/airdrop-no-awdl.png) |
| Deaktivierung entfernt die Kachel und ihre Prozesse | [Deaktiviert](screenshots/gnome/airdrop-disabled-cleanup.png) |

## Prüfumfang

`python3 tools/test-vm.py` synchronisiert die Quellen und führt die GJS-Tests
sowie [test_airdrop.py](../tests/test_airdrop.py) in der VM aus. Die zusätzlichen
Tests prüfen:

- Empfangsdienst-Erkennung über TLS `/Discover`.
- Mehrere Dateien, komprimierte und unkomprimierte DVZip-Blöcke, unveränderte Inhalte.
- Bestehende Dateien werden nicht überschrieben.
- Ablehnung und Abbruch vor Upload hinterlassen keine Dateien.
- Upload ohne angenommenen Ask wird abgewiesen.
- Zustimmung gilt für genau einen Upload.
- Archivdateien müssen den angenommenen Dateinamen entsprechen.
- Ungültige Ask-Dateilisten, nichtlokale IPv6-Ziele, Ordner und doppelte Namen werden abgewiesen.
- Ein fehlendes Funkinterface ergibt einen Fehlerzustand mit Empfang Aus.
- EOF am Steuerkanal beendet den Hilfsprozess.

Die interaktive Prüfung ergänzt Geräteerkennung, native Mehrfachauswahl,
Senden, Warten auf Annahme, Abbrechen und den echten libadwaita-Annahmedialog.
Der [lokale Testempfänger](../tests/airdrop-peer-fixture.py) kann die Annahme
verzögern (`--approval-delay 15`), um den Abbruchknopf zu prüfen. Sein
Ausgabeordner liegt ausschließlich in `/tmp/lightos-airdrop-ui-received`
innerhalb der VM.

Zusätzlich wurde die Erweiterung bei eingeschaltetem Empfang deaktiviert:
Danach existierten weder der installierte Controller noch sein Empfangsprozess
in `/proc`, und die unveränderte verwaltete Desktop-Zuordnung war entfernt.
Nach erneutem Aktivieren ist AirDrop wieder Aus. GNOMEs Panel erhielt kein
AirDrop-Icon. Die virtuelle Testschnittstelle und der Testempfänger wurden
anschließend entfernt/beendet. Empfangs- und Sendedateien bleiben als VM-Belege
erhalten. `.cache/` und die VM-Disk-/Backing-Dateien wurden nicht bereinigt.

Shell Eval wurde nicht eingeschaltet; die finale Abfrage von
`org.gnome.Shell.Eval` lieferte `(false, '')`. Abschließender VM-Stand:
LightOS 4 aktiv, AirDrop Aus, ausschließlich `lo` und `enp0s3` vorhanden.
