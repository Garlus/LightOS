# Bereinigung zum GNOME-Projekt

LightOS ist ab Version 3 ausschließlich eine GNOME-Shell-Erweiterung. Die bestehende UUID `lightos@lightos.dev`, das GSettings-Schema, Farbpaletten und App-Anbindungen bleiben erhalten.

## Entfernt

- Plasma-Widgets in `plasmoids/` und gemeinsame QML-Bausteine in `common/`.
- KWin-Effekte, Fensterverwaltung, Material-/Orb-Plugins sowie Runner- und Qt-Widget-Stile.
- Plasma-/Kvantum-Themes, Fensterdekoration, Switcher, Wallpaper, Iconpack und globale Geist-/Fontconfig-Anpassungen.
- Alter `install.sh`, Desktop-Installer, `lightosctl`, Plasma-Layout und deren Dependency-Lock.
- Alte KDE-VM-/Recording-Werkzeuge und ausschließlich Plasma-bezogene Tests.
- Veraltete KDE-Projektanleitung, KDE-Prüfbericht und dessen zwei Screenshots.

Die GNOME-Erweiterung liegt jetzt direkt unter `extension/`. Build und isolierte VM-Werkzeuge liegen unter `tools/`. Tests und Dokumentation verwenden die neuen Pfade; die Root-README ist die einzige Installationsanleitung. `AGENTS.md` beschreibt ausschließlich den GNOME-Workflow.

## Erhalten

Die Qt-/KDE-App-Farbanbindung ist Bestandteil der GNOME-Erweiterung. Sie färbt solche Apps unter GNOME über vorhandene Farbschnittstellen und benötigt keine Plasma-Sitzung. Die nativen KWrite-/Kate-Syntaxbasen samt Lizenz und das StatusNotifier-Tray-Protokoll bleiben deshalb erhalten.

Die GNOME-VM, ihre Backing-Dateien und sämtliche bestehenden Cache-Daten wurden erhalten. Entfernte Projektdateien sind vor der Bereinigung in einem Wiederherstellungsarchiv unter `.cache/archives/plasma-before-gnome-cleanup-*.tar.gz` gesichert. Das Archiv gehört nicht zum Extension-ZIP. Das Live-Desktopprofil wurde nicht verändert.

## Nachweis

[Bereinigter Desktop in der GNOME-VM](screenshots/gnome/cleanup-desktop.png), [Projektstruktur in der VM](screenshots/gnome/cleanup-project.png), [native Erweiterungseinstellungen](screenshots/gnome/cleanup-preferences.png).

Das neue Paket wurde aus `extension/` gebaut, in der GNOME-VM installiert und nach einem Sitzungsneustart geprüft. Alle 804 GJS-Prüfungen laufen mit der neuen Projektstruktur in temporären XDG-Verzeichnissen. Die Build-Prüfung umfasst ZIP-Inhalt, JavaScript-Syntax, GSettings-Schema und Dokumentationslinks. Die bestehende [visuelle und funktionale Validierung](gnome-validation.md) bleibt verfügbar.
