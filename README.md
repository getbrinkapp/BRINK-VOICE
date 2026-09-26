# BRINK VOICE 0.4

Lokale Audioaufnahme mit zwei Seiten: **Record** und **Script**.

```sh
cd /Users/tom/Developer/VOICE
npm start
```

Node.js ab 22.12.0. Installation bei Bedarf: `npm install`. Lokale macOS-App: `npm run build`, danach `release/mac-arm64/VOICE.app` auf Apple Silicon. Das lokale Paket ist nicht mit einem Apple-Developer-Zertifikat signiert/notarisiert.

## Record

Die komplette Aufnahmeoberfläche passt ins Fenster (ab 1060 × 720). Die Seite scrollt nicht.

- Mikrofon wählen und aktivieren oder direkt aufnehmen. Die genaue Gerätebezeichnung ist sichtbar; die Auswahl wird lokal gespeichert.
- Live-Pegel und Wellenform stammen aus demselben AudioWorklet-Datenstrom wie die PCM-Aufnahme. Ein sichtbarer Verlauf ersetzt die kaum lesbare Momentaufnahme des früheren Oszillogramms. Die Quadratwurzel-Skalierung der Anzeige macht leise Signale sichtbar; Audio bleibt unverändert.
- Start, Pause, Fortsetzen, Stopp. WAV/PCM, Mono, 16 Bit, tatsächliche Abtastrate des Audiogeräts/AudioContext statt fest erzwungener 48 kHz.
- Nach Stopp: Take anhören, in Wellenform/Positionsregler springen, Lautstärke einstellen, WAV exportieren. „Takes“ öffnet die bisherigen Aufnahmen in einem Dialog.
- „Script anzeigen“ ersetzt die große Wellenform durch den Teleprompter. Zeit, kleine Live-Wellenform, Aufnahme/Pause/Stopp bleiben als kompakte Leiste darunter erreichbar. Tempo und Schriftgröße lassen sich einstellen. „Mit Aufnahme“ koppelt Textlauf an Start/Pause/Fortsetzen/Stopp.
- Leertaste steuert Aufnahme/Pause außerhalb von Eingaben und Buttons; Escape stoppt einen laufenden Take. Dialoge blockieren die Aufnahmetastatur.

## Bearbeiten und Lücken entfernen

„Bearbeiten“ in der Take-Vorschau oder unter Takes öffnet die Lückenbereinigung. Die Wellenform zeigt das Original; gelb markierte Abschnitte werden entfernt. Schwelle (−50/−42/−32 dB), Mindestlücke (0,25–1 s) und Restpause (0/80/150 ms) sind einstellbar. Voreinstellung: −42 dB, mindestens 0,4 s, 80 ms Restpause. Die Analyse arbeitet lokal mit 10-ms-RMS-Fenstern. Sie erkennt Stille anhand des Pegels, nicht anhand von Wörtern; bei sehr leiser Sprache die Schwelle senken und das Ergebnis anhören.

„Bereinigten Take erstellen“ schreibt eine separate WAV-Datei. Original und Ergebnis können verglichen werden; „Bereinigtes WAV exportieren“ exportiert das Ergebnis. Neue Takes sind als „Bereinigt“ gekennzeichnet. Kürzere natürliche Pausen bleiben erhalten, Wortgrenzen erhalten 20 ms Schutz pro Seite und Schnittkanten 3 ms Ausblendung gegen Knackser. Auch bei Restpause „Keine“ bleibt dieser kleine Schutz. Reine Stille oder Takes ohne passende Lücken erzeugen keine leeren/unnötigen Kopien. Lange Takes werden blockweise verarbeitet.

Die Live-Wellenform zeichnet eine feine zusammenhängende Hüllkurve mit festem Zeitfenster von zehn Sekunden. Beim Pausieren frieren große und kleine Wellenform sofort ein; Status, Zeit und Hinweis zeigen „Pausiert“. Fortsetzen hängt neue Signaldaten ohne die Pausenzeit an.

## Script

Eigene Seite zum Schreiben und Bearbeiten. Import von UTF-8 TXT, Markdown, SRT und VTT bis 2 MB; importierter Text wird angehängt, Untertitel-Zeitcodes entfernt. „In Record ablesen“ wechselt zu Record und aktiviert die große Script-Ansicht. Der Entwurf wird lokal gespeichert. Nur Textfeld und Lesetext scrollen intern, nie die Record-Seite.

## Warum bisher stumme Takes entstanden

Bei der Diagnose am 26.09.2026 enthielten drei vorhandene WAV-Dateien ausschließlich Nullsamples. macOS verwendete „Speaker Audio Recorder (Virtual)“ als Systemstandard. Zusätzlich meldete die Hardware einen geschlossenen MacBook-Deckel. Das eingebaute Mikrofon lieferte ebenfalls Nullsamples, obwohl Freigabe vorhanden, Stummschaltung aus und Eingangslautstärke 50 % war.

VOICE vermeidet einen erkannten virtuellen Standard, sofern ein physischer Audioeingang verfügbar ist. Explizite Geräteauswahlen werden respektiert. Bei geschlossenem MacBook und ausgewähltem eingebautem Mikrofon zeigt die App eine konkrete Fehlermeldung, bevor ein leerer Take entsteht. Deckel öffnen oder ein externes Mikrofon verwenden. Hardwarezustand wird ausschließlich gelesen, keine Systemeinstellung geändert.

Apple dokumentiert die Hardwareabschaltung: https://support.apple.com/en-ca/guide/security/secbbd20b00b/web

Bei anderen stillen Eingängen erscheint nach drei Sekunden „Kein Signal – Eingang prüfen“. Der AudioWorklet-Start wird bestätigt; fehlende Daten und abgebrochene Streams werden gemeldet.

## Speicherung

Takes werden blockweise im Benutzerverzeichnis `VOICE/Recordings` geschrieben (macOS: `~/Library/Application Support/VOICE/Recordings`). „Ordner öffnen“ zeigt den Speicherort. Unterbrochene `.wav.partial`-Dateien werden beim nächsten Start aus den vorhandenen Samples wiederhergestellt. Ein WAV-Take ist auf etwa 4 GB beschränkt. Keine Cloud oder Anmeldung. Keine Videoaufnahme oder Kameraberechtigung.

## Tests

- `npm test`: 16 Prüfungen inklusive Lückenanalyse, Originalerhalt, Schnittlängen, leiser Sprache, reiner Stille, Einstellungen und Dateiformat, Wiederherstellung, PCM/Pause, Pegelmessung, Textimport, Geräteauswahl, Deckelerkennung und Byte-Range-Wiedergabe.
- `npm run test:smoke`: vollständiger Ablauf mit bekanntem moduliertem 440-Hz-Signal. Prüft Frequenz/Signalenergie der tatsächlichen WAV-Datei, gemalte Wellenformpixel, Live-Pegel, sofortigen Pausenstatus, pixelgleich eingefrorene große/kleine Wellenform trotz laufender Mikrofonquelle, Fortsetzen, Textkopplung, Wiedergabe/Seek/Export, Lückenanalyse, bereinigten Take samt Vergleich und WAV-Export, getrennte Seiten, scrollfreies Layout und Entwurf-/Take-Persistenz.
- `electron tests/hardware-input.cjs`: prüft den konkreten geschlossenen-Deckel-Fall mit echter Geräteauflistung, ohne eine stumme Aufnahme zu speichern.

Der Signaltest nutzt einen temporären Datenordner, simulierte Geräte und eine generierte WAV-Datei. Nur im Test wird der Chromium-Audioservice-Sandbox-Schalter deaktiviert, damit der Testprozess die temporäre Datei lesen kann. Die ausgelieferte App behält die normalen Sandboxes. Ein Sprachtest mit geöffnetem MacBook oder externem Mikrofon ist zusätzlich nötig; ein geschlossener Deckel lässt sich nicht durch Software beheben.
