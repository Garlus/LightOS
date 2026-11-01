# Installation und Bedienung

## Voraussetzungen

GNOME Shell 50 unter Wayland; Python 3 für den Build. Systemwerkzeuge benötigen
PyGObject, GTK 4 und libadwaita. Optional: Flatpak, Homebrew und Tesseract für OCR.

## Installation

Build und Installation stehen in der [README](../README.md#installation).
Nach Installation oder Update unter Wayland ab- und wieder anmelden.

```bash
gnome-extensions prefs lightos@lightos.dev     # Einstellungen
gnome-extensions disable lightos@lightos.dev   # Deaktivieren
```

## Bedienung

- **Super + Leertaste:** Suche; Pfeiltasten/Tab wählen, Enter öffnet oder kopiert
  Rechenergebnisse. Escape oder Außenklick schließen. Darstellung: 70 % Größe,
  ohne Desktop-Abdunklung. Vollständige Dateisuche benötigt einen GNOME-Suchindex.
- **Super:** GNOME-Übersicht. **Strg + Super + C:** Fenster zentrieren.
- **System-Icon neben Quick Settings:** Monitoring, App-Verwaltung, Bereinigung und OCR.
- **Einstellungen:** Hell/Dunkel/System, fünf Paletten oder Hintergrundfarben,
  Sonnenautomatik und Geist/Adwaita. Optional: 42-px-Panel, Schriftglättung,
  Druckanimationen und Maximieren auf eigener Arbeitsfläche.

Deaktivieren stellt verwaltete Einstellungen wieder her; spätere Benutzeränderungen
bleiben erhalten. Sicherungen: `~/.local/state/lightos-gnome/`.
