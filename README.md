# BRINK VOICE 0.7.0

Lokales Voice-over-Studio mit **Record**, **Script** und einem Editor für freie Schnitte, Pausen und Klangeffekte.

Seit 27.09.2026 über BRINK CORE angebunden: BRINK Studio und die eigenständige BRINK CONSOLE können VOICE starten. „BRINK Projekte“ übernimmt Script/Audio; Takes und geprüfte Scriptänderungen können direkt zurückgegeben werden. Auch direkte Starts benötigen vor dem Öffnen eine aktive Admin-, Alpha-, Studio- oder Studio+-Freigabe, aber kein geöffnetes BRINK-Fenster. Lokale Takes bleiben erhalten. Gemeinsame Bridge im Hauptrepository pflegen (`npm run suite:sync`). Grenzen und Release-Checkliste: [BRINK CORE](../../docs/BRINK_CORE.md).

Die aktuelle Bedienung, Effektreihenfolge und Übergabe an BRINK/CINE stehen in [docs/STUDIO.md](docs/STUDIO.md).

```sh
cd /Users/tom/Developer/brink/apps/VOICE
npm start
```

Node.js ab 22.12.0. Installation bei Bedarf: `npm install`. Lokale macOS-App: `npm run build`, danach `release/mac-arm64/VOICE.app` auf Apple Silicon. Das lokale Paket ist nicht mit einem Apple-Developer-Zertifikat signiert/notarisiert.

## Transkription

Take auswählen → **Transkribieren** → Sprache wählen → starten. Whisper läuft lokal; Texte sind editierbar, kopierbar, als TXT exportierbar und als neues Script nutzbar. Die macOS-App für Apple Silicon enthält Modell und Engine. Details unter [docs/STUDIO.md](docs/STUDIO.md).

Für einen frischen Entwicklungscheckout vor dem Paketieren `npm run setup:whisper` ausführen (CMake und Xcode Command Line Tools erforderlich).

## Record

Die komplette Aufnahmeoberfläche passt ins Fenster (ab 1060 × 720). Die Seite scrollt nicht.

- Mikrofon wählen und aktivieren oder direkt aufnehmen. Die genaue Gerätebezeichnung ist sichtbar; die Auswahl wird lokal gespeichert.
- Live-Pegel und Wellenform stammen aus demselben AudioWorklet-Datenstrom wie die PCM-Aufnahme. Ein sichtbarer Verlauf ersetzt die kaum lesbare Momentaufnahme des früheren Oszillogramms. Die Quadratwurzel-Skalierung der Anzeige macht leise Signale sichtbar; Audio bleibt unverändert.
- Start, Pause, Fortsetzen, Stopp. WAV/PCM, Mono, 16 Bit, tatsächliche Abtastrate des Audiogeräts/AudioContext statt fest erzwungener 48 kHz.
- Nach Stopp: Take anhören, in Wellenform/Positionsregler springen, Lautstärke einstellen, WAV exportieren. Die linke Seitenleiste zeigt gespeicherte Takes dauerhaft mit Datum, Dauer und Status Original/Bereinigt. Auswahl, Anhören/Pause, Bearbeiten, Export und Löschen sind direkt erreichbar; nur die Liste scrollt. Während einer Aufnahme ist die Take-Bedienung gesperrt.
- „Script anzeigen“ ersetzt die große Wellenform durch den Teleprompter. Zeit, kleine Live-Wellenform, Aufnahme/Pause/Stopp bleiben als kompakte Leiste darunter erreichbar. Tempo und Schriftgröße lassen sich einstellen. „Mit Aufnahme“ koppelt Textlauf an Start/Pause/Fortsetzen/Stopp.
- Leertaste steuert Aufnahme/Pause außerhalb von Eingaben und Buttons; Escape stoppt einen laufenden Take. Der Bearbeitungsdialog blockiert die Aufnahmetastatur.

## Bearbeiten und Lücken entfernen

„Bearbeiten“ in der Take-Vorschau oder nach Auswahl eines Takes links öffnet die Pausenbearbeitung. Die Wellenform zeigt das Original; gelb markierte Abschnitte werden entfernt. Schwelle (−50/−42/−32 dB), Mindestlücke (0,25–1 s) und Restpause (0/80/150 ms) sind einstellbar. Voreinstellung: −42 dB, mindestens 0,4 s, 80 ms Restpause. Die Analyse arbeitet lokal mit 10-ms-RMS-Fenstern. Sie erkennt Stille anhand des Pegels, nicht anhand von Wörtern; bei sehr leiser Sprache die Schwelle senken und das Ergebnis anhören.

Gelbe Bereiche lassen sich vor dem Bereinigen manuell anpassen: an den Griffen links/rechts ziehen, um Beginn/Ende zu ändern; in der Fläche ziehen, um die ganze Lücke zu verschieben. Unter der Wellenform wird die gewählte Pause mit Dauer und einer Zeitspanne mit einer Nachkommastelle angezeigt. „Weniger entfernen“/„Mehr entfernen“ verändern beide Seiten um jeweils bis zu 0,05 Sekunden; Pfeile wechseln zwischen den Pausen. Der Play-Button dort spielt die Stelle im Original mit etwas Vor-/Nachlauf ab und stoppt automatisch. Pfeiltasten verschieben den fokussierten Griff/Bereich um 10 ms, mit Shift um 100 ms. „Zurücksetzen“ stellt die zuletzt automatisch erkannten Grenzen wieder her. Änderungen an Schwelle/Mindestlücke/Restpause starten eine neue Analyse und ersetzen manuelle Anpassungen. Überlappende Bereiche werden beim Rendern vereinigt; die WAV-Datei verwendet die angezeigten Grenzen auf das nächste Sample gerundet. Änderungen nach einer Bereinigung erfordern einen neuen bereinigten Take, bevor erneut exportiert werden kann.

„Als neuen Take speichern“ schreibt eine separate WAV-Datei mit allen Schnitten und Effekten. Original und Ergebnis können verglichen werden; „WAV exportieren“ exportiert das Ergebnis. Neue Ergebnisse sind als „Bearbeitet“ gekennzeichnet. Kürzere natürliche Pausen bleiben erhalten, Wortgrenzen erhalten 20 ms Schutz pro Seite und Schnittkanten 3 ms Ausblendung gegen Knackser. Auch bei Restpause „Keine“ bleibt dieser kleine Schutz. Reine Stille oder Takes ohne passende Lücken erzeugen keine leeren/unnötigen Kopien. Lange Takes werden blockweise verarbeitet.

Statusanzeigen im Editor zeigen Analyse/Verarbeitung, erkannte Pausen (gelb), Anpassungen (blau), Erfolg (grün), Fehler (rot) und keine nötigen Schnitte (neutral) zusätzlich zu Text und Symbol. Die Audio-Schnitte bleiben samplegenau, die vereinfachte Anzeige verändert keine Schnittgrenzen.

Die Live-Wellenform zeichnet eine feine zusammenhängende Hüllkurve mit festem Zeitfenster von zehn Sekunden. Beim Pausieren frieren große und kleine Wellenform sofort ein; Status, Zeit und Hinweis zeigen „Pausiert“. Fortsetzen hängt neue Signaldaten ohne die Pausenzeit an.

## Script

Eigene Seite zum Schreiben und Bearbeiten. Import von UTF-8 TXT, Markdown, SRT und VTT bis 2 MB; importierter Text wird angehängt, Untertitel-Zeitcodes entfernt. „In Record ablesen“ wechselt zu Record und aktiviert die große Script-Ansicht. Mehrere benennbare Scripts und Projektzuordnungen werden lokal gespeichert; ausstehende Änderungen werden zusätzlich als Entwurf gesichert. Nur Textfeld und Lesetext scrollen intern, nie die Record-Seite.

## Warum bisher stumme Takes entstanden

Bei der Diagnose am 26.09.2026 enthielten drei vorhandene WAV-Dateien ausschließlich Nullsamples. macOS verwendete „Speaker Audio Recorder (Virtual)“ als Systemstandard. Zusätzlich meldete die Hardware einen geschlossenen MacBook-Deckel. Das eingebaute Mikrofon lieferte ebenfalls Nullsamples, obwohl Freigabe vorhanden, Stummschaltung aus und Eingangslautstärke 50 % war.

VOICE vermeidet einen erkannten virtuellen Standard, sofern ein physischer Audioeingang verfügbar ist. Explizite Geräteauswahlen werden respektiert. Bei geschlossenem MacBook und ausgewähltem eingebautem Mikrofon zeigt die App eine konkrete Fehlermeldung, bevor ein leerer Take entsteht. Deckel öffnen oder ein externes Mikrofon verwenden. Hardwarezustand wird ausschließlich gelesen, keine Systemeinstellung geändert.

Apple dokumentiert die Hardwareabschaltung: https://support.apple.com/en-ca/guide/security/secbbd20b00b/web

Bei anderen stillen Eingängen erscheint nach drei Sekunden „Kein Signal – Eingang prüfen“. Der AudioWorklet-Start wird bestätigt; fehlende Daten und abgebrochene Streams werden gemeldet.

## Speicherung

Takes werden blockweise im Benutzerverzeichnis `VOICE/Recordings` geschrieben (macOS: `~/Library/Application Support/VOICE/Recordings`). „Aufnahmeordner öffnen“ zeigt den Speicherort. Unterbrochene `.wav.partial`-Dateien werden beim nächsten Start aus den vorhandenen Samples wiederhergestellt. Ein WAV-Take ist auf etwa 4 GB beschränkt. Keine Cloud oder Anmeldung. Keine Videoaufnahme oder Kameraberechtigung.

## Tests

- `npm test`: 30 Prüfungen inklusive Lückenanalyse, Originalerhalt, Schnittlängen, leiser Sprache, reiner Stille, Einstellungen und Dateiformat, Wiederherstellung, PCM/Pause, Pegelmessung, Textimport, Geräteauswahl, Deckelerkennung und Byte-Range-Wiedergabe.
- `npm run test:studio`: freie Schnitte, Zoom, Verlauf, Effektvorlagen, RNNoise-Vorschau, Originalvergleich, Import, Script-/Projektverwaltung und BRINK/CINE-Übergabe.
- `npm run test:smoke`: vollständiger Ablauf mit bekanntem moduliertem 440-Hz-Signal. Prüft Frequenz/Signalenergie der tatsächlichen WAV-Datei, gemalte Wellenformpixel, Live-Pegel, sofortigen Pausenstatus, pixelgleich eingefrorene große/kleine Wellenform trotz laufender Mikrofonquelle, Fortsetzen, Textkopplung, Wiedergabe/Seek/Export, Lückenanalyse, bereinigten Take samt Vergleich und WAV-Export, getrennte Seiten, scrollfreies Layout und Entwurf-/Take-Persistenz.
- `electron tests/hardware-input.cjs`: prüft den konkreten geschlossenen-Deckel-Fall mit echter Geräteauflistung, ohne eine stumme Aufnahme zu speichern.

Der Signaltest nutzt einen temporären Datenordner, simulierte Geräte und eine generierte WAV-Datei. Nur im Test wird der Chromium-Audioservice-Sandbox-Schalter deaktiviert, damit der Testprozess die temporäre Datei lesen kann. Die ausgelieferte App behält die normalen Sandboxes. Ein Sprachtest mit geöffnetem MacBook oder externem Mikrofon ist zusätzlich nötig; ein geschlossener Deckel lässt sich nicht durch Software beheben.
