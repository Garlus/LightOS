# Bewertung: Themeninstallation durch die LightOS-Erweiterung

Prüfstand: 1. November 2026. Architekturprüfung mit OpenCode und
`opencode/deepseek-v4.1-flash-free`, anschließend redaktionell und gegen den
aktuellen Quellstand geprüft. Dies ist eine Machbarkeitsbewertung; ein Importer
wurde in dieser Änderung nicht implementiert.

## Ergebnis

**Zusätzliche Farbpaletten lassen sich direkt über die Erweiterung installieren.**
Empfohlen wird ein lokaler JSON-Import im separaten GTK-/libadwaita-
Einstellungsprozess (`prefs.js`). Die Shell lädt ausschließlich validierte
Farbwerte. Ein solcher Import kann die bestehende GNOME-Geometrie erhalten,
weil Radien, Abstände, Schriftmetriken und Icons nicht Bestandteil des Formats
sind. GNOME dokumentiert den Einstellungsprozess und seine GTK4-/Adwaita-
Oberfläche in der [Entwicklungsanleitung](https://gjs.guide/extensions/development/preferences.html).

Ein Omarchy-/Oma-Cast-Themenpaket ist dagegen nicht unmittelbar kompatibel:
LightOS benötigt zwei explizite Farbvarianten und die Token seiner eigenen
GTK-, Shell-, Terminal- und Syntaxadapter. Eine vorgeschaltete Konvertierung
müsste diese Zuordnung leisten und fehlende Werte bestimmen.

## Vorhandene Infrastruktur

`extension/palettes/` enthält fünf JSON-Paletten mit `id`, `label`, `gnomeAccent`,
`source` und `variants.light/dark`. Jede Variante besitzt 57 Farbtoken.
`readPalette()` liest derzeit ausschließlich aus dem Erweiterungspaket;
`normalizePaletteId()` bildet unbekannte IDs auf Ocean ab.

Die Auswahlmenge ist über `PALETTES` und `LABELS` festgelegt. Sie wird in
`prefs.js`, der neuen Suche, `appThemes.js` und `terminalThemes.js` verwendet.
ChromaLeon verwendet Ocean als Basis. Die ANSI-Ableitung in `terminalThemes.js`
benötigt zusätzlich die eingebauten Paletten Ocean, Grove und Iris.

Das GSettings-Feld `palette` ist bereits ein freier String. Für zusätzliche IDs
ist keine Schemaerweiterung erforderlich. Die feste Liste und die Migration
müssen jedoch vor Einführung eines Importers angepasst werden, damit eine
Nutzerauswahl nicht sofort auf Ocean zurückgesetzt wird.

## Empfohlener Installationspfad

1. Der Benutzer wählt eine lokale JSON-Datei in den LightOS-Einstellungen aus.
   Die Dateiauswahl und Validierung laufen in `prefs.js`, getrennt vom
   GNOME-Shell-Prozess. Keine Installation von Quellcode oder ausführbaren Dateien.
2. Vor dem Parsen wird die Dateigröße auf 64 KiB begrenzt. Das Format muss eine
   eindeutig unterstützte Schemaversion haben. Doppelte Schlüssel, unbekannte
   Eigenschaften, Arrays anstelle von Objekten und übermäßige Verschachtelung
   werden verworfen. Ein gewöhnliches `JSON.parse()` erkennt doppelte Schlüssel
   nicht; hierfür ist eine gesonderte Prüfung erforderlich.
3. Die ID erhält einen ausschließlich internen Dateinamen mit enger
   Zeichen-Whitelist. Eingebaute IDs bleiben reserviert. Anzeigename und
   Quellenmetadaten werden als begrenzter Klartext behandelt. Pro Variante muss
   exakt der bekannte Tokensatz vorliegen; alle Farbwerte entsprechen
   `^#[0-9a-f]{6}$`. `gnomeAccent` muss Mitglied des installierten GNOME-Enums sein.
4. Die Palette wird unter
   `$XDG_DATA_HOME/lightos-gnome/palettes/<id>.json` installiert. Der Pfad liegt
   außerhalb des bei Extension-Updates ersetzten Paketverzeichnisses. Neue private
   Verzeichnisse verwenden Modus `0700`; symbolische Links werden im verwalteten
   Importpfad zurückgewiesen.
5. Nach erfolgreichem atomarem Schreiben und Rücklesen wird die Palette in die
   Auswahl aufgenommen. Die laufende Shell validiert erneut; ein fehlerhaftes
   Dokument darf den Shell-Start nicht abbrechen. Die bestehende Auswahl bleibt
   bei einem Installationsfehler bestehen. Gio stellt dafür
   [`File.replace_contents`](https://docs.gtk.org/gio/method.File.replace_contents.html)
   bereit; die Verzeichniswahl folgt der
   [XDG-Spezifikation](https://specifications.freedesktop.org/basedir-spec/latest/).
6. Ersetzen einer Palette benötigt eine ausdrückliche Auswahl im Importdialog;
   die bisherige Fassung bleibt bis zum erfolgreichen Abschluss wiederherstellbar.
   Beim Entfernen der aktiven Palette wird zuvor Ocean gewählt. Deaktivierung
   stellt wie bisher die übernommenen App-Einstellungen wieder her, belässt aber
   die importierten Benutzerdaten.

Die Installation darf weder CSS noch Shell-Befehle, Skripte, Archive mit freien
Zielpfaden oder Root-Aktionen akzeptieren. Die heutigen Adapter interpolieren
Farbwerte in CSS, XML und INI; ungeprüfte Fremddaten wären deshalb für einen
Import ungeeignet. Dieser Befund betrifft einen künftigen Fremddatenpfad, nicht
einen bereits vorhandenen Download- oder Installationsdienst.

## Erforderliche Änderungen

| Bereich | Änderung |
|---|---|
| Palettenregistrierung | Eine gemeinsame Funktion liefert unveränderliche Built-ins und validierte Nutzerpaletten; stabile IDs ersetzen die Indexkopplung von `PALETTES`/`LABELS`. |
| Auswahl und Migration | Historische IDs zuerst übersetzen, dann gegen die gesamte Bibliothek prüfen; fehlende Dateien führen kontrolliert zu Ocean. |
| Einstellungen und Suche | Auswahl dynamisch aufbauen; Import, Ersetzen und Entfernen im Einstellungsprozess ergänzen. |
| App- und Terminaladapter | Zusätzliche IDs unterstützen; Built-ins für ANSI-Ableitung erhalten. Ausgabedateien begrenzen oder nur die aktive Palette erzeugen. |
| ChromaLeon | Unabhängige Farbquelle belassen. Eine importierte Palette wird bei expliziter Auswahl im statischen Palettenmodus angewendet. |
| Lebenszyklus | Bestehende Journale und Rücknahme erhalten; Importdateien unabhängig vom Extension-Paket verwalten. |

Die Farbzuordnung kann die offiziellen
[libadwaita-Farbvariablen](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/css-variables.html)
verwenden. Die tatsächlich vorhandene libadwaita-Version ist für die
Kompatibilitätsprüfung maßgeblich. Eigene Geometrie- und Schriftregeln würden dem
Projektauftrag widersprechen; auch die
[GNOME HIG](https://developer.gnome.org/hig/guidelines/ui-styling.html)
empfiehlt zurückhaltendes Custom-Styling.

## Alternativen

| Ansatz | Bewertung |
|---|---|
| Lokaler JSON-Farbpalettenimport | Empfohlen. Überschaubare Vertrauensgrenze, updatefeste Benutzerdaten, kein privilegierter Installationsprozess. |
| Kuratierter Onlinekatalog | Möglich als spätere Ausbaustufe. Benötigt begrenzte Downloads, TLS, Quellenanzeige, Integritätsprüfung und klare Datenschutzregeln. |
| Vollständiges GTK-/Shell-Theme | Erfüllt den vorliegenden Gestaltungsauftrag nicht: freies CSS kann sämtliche Widgetmetriken ändern. |
| Installer aus fremdem Repository | Ungeeignet für einen Datenimport. Würde beliebigen Programmcode im Benutzerkontext ausführen. |
| Weitere Paletten im LightOS-ZIP | Technisch bereits möglich; neue Paketrevision erforderlich, daher kein direkter Benutzerimport. |

## Prüfbedarf und Aufwand

Mittlerer Umbauaufwand: Validator und Verzeichnislader sind begrenzt; die
Entkopplung der festen Auswahl und die Kompatibilität aller Adapter bilden den
wesentlichen Integrationsanteil. Eine belastbare Zeitangabe erfordert eine
separate Implementierungsplanung.

Die Abnahme benötigt Modultests für gültige und ungültige Dokumente,
Pfadmanipulation, CSS-/XML-Injektion, doppelte Schlüssel, Größenlimits,
Schreibfehler, Überschreiben und fehlende Dateien. In der isolierten VM sind
Hell/Dunkel, Suchauswahl, GTK3/GTK4, Terminal, Syntaxfarben sowie Deaktivierung
und Wiederaktivierung zu prüfen. Kontrast und Lesbarkeit müssen zusätzlich
visuell beurteilt werden; syntaktisch gültige Farben garantieren keine
barrierefreie Palette.

Offen sind das Verhalten bei aktivem GNOME-Kontrastmodus, die gewünschte
Bibliotheksgrenze und die Last vieler generierter Adapterdateien. Eine eventuelle
Veröffentlichung auf extensions.gnome.org ist gesondert gegen die aktuellen
[Review Guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html)
zu prüfen; diese Bewertung stellt keine Freigabezusage dar.
