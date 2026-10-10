# Selbst in der GNOME-Test-VM testen

Die bestehende Fedora-44-VM enthält GNOME Shell 50.5 / Wayland und den
zuletzt validierten LightOS-Stand. Sie benutzt dieselbe Disk wie die Prüfberichte;
Änderungen in der VM bleiben nach einem Neustart erhalten.

## Grafischer Zugang

Im LightOS-Projektordner ausführen:

```bash
python3 tools/vm-view.py
```

Das startet bei Bedarf die vorhandene VM und öffnet den lokalen
[Browserzugang](http://127.0.0.1:6080/vnc.html?host=127.0.0.1&port=6081&path=.&encrypt=false&autoconnect=true&resize=scale).
Beim ersten Aufruf wird noVNC 1.6.0 ausschließlich unter `.cache/` vorbereitet.
QEMU liefert den WebSocket-Zugang direkt; Python dient als lokaler Webserver.
Die Erweiterung wird dabei nicht auf dem Host
installiert. Die VM meldet den Benutzer `lightos` automatisch an.

In den Desktop klicken, um ihn mit Maus und Tastatur zu bedienen. Im seitlichen
noVNC-Menü gibt es Vollbild und zusätzliche Tasten. Super öffnet die GNOME-Übersicht;
Super + Leertaste öffnet die LightOS-Suche. Falls der Host oder Browser diese
Tasten abfängt, können sie über das noVNC-Tastenmenü oder die folgenden
VM-Befehle gesendet werden:

```bash
python3 tools/vm.py key super
python3 tools/vm.py key super spc
```

Rechts oben öffnen sich die Quick Settings mit der AirDrop-Kachel. Die
LightOS-Einstellungen lassen sich in der VM über „Erweiterungen“ öffnen.
Alternativ öffnet dieser Befehl das Einstellungsfenster direkt:

```bash
python3 tools/vm.py ssh 'XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus gnome-extensions prefs lightos@lightos.dev'
```

AirDrop ist zunächst Aus. Die VM besitzt keine AWDL-fähige WLAN-Karte;
echte Funkübertragungen zu Apple-Geräten lassen sich darin nicht prüfen.
Die bisherigen lokalen Transporttests und ihre Grenzen stehen im
[AirDrop-Prüfbericht](airdrop-validation.md).

Der am 10. Oktober 2026 aktualisierte Stand ist **LightOS 5** mit AirDrop,
den sechs bisherigen Farbpaletten und der zusätzlichen ChromaLeon-Engine im
Reiter **Appearance**. Die abschließenden Tests und Aufnahmen stehen im
[ChromaLeon-Prüfbericht](chromaleon-validation.md).
[Aufnahme der laufenden Sitzung](screenshots/gnome/vm-access-desktop.png).

Zugangsprüfung: noVNC-HTML und JavaScript-Module antworten mit HTTP 200;
QEMU akzeptiert den WebSocket-Handshake mit HTTP 101 und liefert das binäre
VNC-Protokoll `RFB 003.008`. SSH funktioniert, LightOS 5 ist `ACTIVE`,
und Shell Eval bleibt deaktiviert. Ein steuerbarer Browser ist in der
Agent-Umgebung nicht verfügbar; die Browseroberfläche konnte deshalb hier
nicht durchgeklickt werden. Die Aufnahme stammt direkt aus der laufenden VM.

## Terminalzugang und Lebenszyklus

```bash
python3 tools/vm.py ssh
python3 tools/vm.py stop
python3 tools/vm-view.py
```

SSH nutzt den bereits vorhandenen Schlüssel aus `.cache/vm-gnome/id_ed25519`.
In der Test-VM kann `lightos` mit `sudo` ohne Passwort administrative Befehle
ausführen. VM herunterfahren, wenn der Test abgeschlossen ist; der Browserzugang
zeigt dann keine laufende Sitzung mehr. Ein Neustart verwendet dieselbe Disk.
Nach `stop` das vollständige Herunterfahren abwarten; Fedora kann dabei auf
seinen Paketdienst warten. Eine bereits mit älteren Werkzeugen gestartete VM
muss einmal regulär heruntergefahren werden, damit der WebSocket-Anschluss
beim nächsten Start bereitsteht.

VNC (`127.0.0.1:5910`), WebSocket (`127.0.0.1:6081`), Browser (`127.0.0.1:6080`) und SSH
(`127.0.0.1:2233`) sind nur auf diesem Rechner erreichbar. Der Browserzugang
steuert dieselbe GNOME-Sitzung wie die Testwerkzeuge. Während eigener Tests
sollten automatisierte Klicks und Sitzungsneustarts pausieren.
Die VM-Disk und ihre Backing-Dateien in `.cache/` erhalten.

Quellen des zusätzlichen lokalen Viewers: [noVNC](https://github.com/novnc/noVNC)
(MPL-2.0, Revision `a8dfd6a3ea3c74244f5ebdaa5a7f1023007a7820`) und
[QEMUs nativer WebSocket-Zugang](https://www.qemu.org/docs/master/system/invocation.html).
