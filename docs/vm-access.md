# GNOME-Test-VM

Die isolierte Fedora-44-VM verwendet GNOME Shell 50 / Wayland. Installation,
Sitzungsneustarts und interaktive Tests erfolgen hier. Die VM-Disk, ihre
QCOW2-Backing-Dateien und sämtliche vorhandenen Daten in `.cache/` erhalten.

## Browserzugang

```bash
python3 tools/vm-view.py
```

Das Werkzeug startet bei Bedarf die bestehende VM und öffnet noVNC. Beim ersten
Aufruf wird noVNC 1.6.0 unter `.cache/novnc` vorbereitet. Der Benutzer `lightos`
wird automatisch angemeldet. Änderungen in der VM bleiben nach Neustarts erhalten.
Während manueller Bedienung keine automatisierten Eingaben oder Neustarts ausführen.

## Build und Installation

```bash
python3 tools/build.py
python3 tools/vm.py install
python3 tools/vm.py ssh 'sudo systemctl restart gdm'
```

Der GDM-Neustart beendet die laufende VM-Sitzung. Anschließend wird das aktualisierte
ZIP in einer neuen Wayland-Sitzung geladen. Installation und Tests verändern das
Host-Desktopprofil nicht.

## Steuerung und Prüfung

```bash
python3 tools/vm.py ssh
python3 tools/vm.py key super spc
python3 tools/vm.py capture /tmp/lightos.png
python3 tools/test-vm.py
python3 tools/vm.py stop
```

`tools/test-vm.py` synchronisiert den Quellstand und führt die isolierten Tests
mit temporären XDG-Verzeichnissen und einem GSettings-Speicherbackend aus.
Die Werkzeuge `tools/validate-*.py` dienen der gezielten Laufzeitprüfung und
erzeugen bei Bedarf neue Prüfberichte und Aufnahmen. Shell Eval ist ausschließlich
ein VM-Testhilfsmittel und muss nach der Prüfung deaktiviert werden.

SSH verwendet `127.0.0.1:2233` und `.cache/vm-gnome/id_ed25519`.
VNC (`5910`), WebSocket (`6081`) und noVNC (`6080`) sind ebenfalls nur lokal
erreichbar. QMP liegt unter `.cache/vm-gnome/`. `lightos` verfügt innerhalb der
VM über passwortloses sudo. Nach `stop` das vollständige Herunterfahren abwarten.

Die [aktuelle Aufnahme](screenshots/gnome/lightos.png) stammt vom 18. Oktober 2026:
LightOS 9, GNOME Shell 50.5, aus dem aktuellen ZIP installiert und nach
Sitzungsneustart als ACTIVE bestätigt. Die VM besitzt keine AWDL-fähige WLAN-Karte;
echte AirDrop-Funktransfers lassen sich darin nicht prüfen.

Viewer: [noVNC](https://github.com/novnc/noVNC), MPL-2.0,
Revision `a8dfd6a3ea3c74244f5ebdaa5a7f1023007a7820`;
Transport: [QEMU](https://www.qemu.org/docs/master/system/invocation.html).
