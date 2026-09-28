# VOICE 0.7 – Aufnahme, Schnitt und Klang

## Aufnahme und Takes
Record bleibt eine Seite ohne äußeres Scrollen. Mikrofon aktivieren, Pegel prüfen und aufnehmen. Pause stoppt die Wellenform und die gespeicherten Samples sofort. Die linke Bibliothek enthält alle Takes, Suche, Projektfilter, Favoriten und Audioimport. Mit dem Stiftsymbol neben jedem Take lässt sich dessen Name direkt in der Liste ändern. Enter oder „Speichern“ übernimmt ihn; Escape oder „Abbrechen“ verwirft die Eingabe. Über „Take verwalten“ werden außerdem Favorit, Script und Projekt zugeordnet.

## Scripts
Mehrere Scripts werden lokal in `library.json` gespeichert. Text, Name und Projekt werden automatisch gesichert; noch ausstehende Änderungen werden zusätzlich im lokalen Entwurf gesichert. Beim Aufnahmeabschluss wird der Take dem aktuellen Script und dessen Projekt zugeordnet. TXT, Markdown, SRT und VTT lassen sich importieren. „In Record ablesen“ aktiviert den Teleprompter.

## Schnitt
„Bearbeiten“ öffnet den Bereich „Schnitt & Pausen“. Die gelben Bereiche werden beim Rendern entfernt. Grenzen und ganze Bereiche lassen sich ziehen; Pfeiltasten korrigieren um 0,01 s, mit Umschalt um 0,1 s. „Bereich behalten“ deaktiviert einen Schnitt. Grüne Bereiche bleiben enthalten. „Bereich markieren“ erlaubt freie Auswahl: „Auswahl entfernen“ schneidet sie heraus, „Nur Auswahl behalten“ kürzt die Enden. Überlappende Schnitte werden vereinigt. Zoom vergrößert die Zeitleiste; die horizontale Bildlaufleiste verschiebt den Ausschnitt. Rückgängig/Wiederholen funktioniert auch für Klangänderungen. Entwürfe bleiben pro Take erhalten. Kurze Blenden an den Schnittkanten mindern Klicks.

## Klang & Effekte
Die Verarbeitung läuft lokal im Hintergrund, verändert echte Audiodaten und kann abgebrochen werden. Originale bleiben erhalten. Effekte werden nach den Schnitten in dieser Reihenfolge berechnet:

1. **Stimmisolation:** RNNoise, sprachoptimierte KI-Rauschunterdrückung mit regelbarer Beimischung. Für Umgebungslärm; keine vollständige Trennung mehrerer Sprecher oder überlagerter Musik.
2. **Rumpelfilter und Gate:** Tieffrequente Störungen entfernen, leise Zwischenräume beruhigen.
3. **Equalizer:** Bass 120 Hz, Wärme 300 Hz, Mitten 1 kHz, Präsenz 3,5 kHz, Brillanz 8 kHz; jeweils ±12 dB.
4. **De-Esser:** Zischlaute abschwächen.
5. **Auto-Level:** Dynamische Angleichung schwankender Pegel.
6. **Kompressor:** Schwelle, Verhältnis, Attack, Release und Aufholverstärkung.
7. **Ausgangspegel, Lautheitsnormalisierung und Limiter:** Regelbares LUFS-Ziel und optionaler Peak-Schutz bei −1 dB. Die Normalisierung ist dynamisch; sie ist keine garantierte Broadcast-Abnahme.

„Natürlich & klar“, „Warm & voll“, „Podcast / Broadcast“ und „Unruhige Umgebung“ sind Ausgangspunkte. Eigene Vorlagen können gespeichert werden. „Vorschau berechnen“ erstellt eine temporäre Hörprobe; Original/Vorschau erlaubt den Vergleich. Nach einer Änderung wird die alte Vorschau verworfen. „Als neuen Take speichern“ erzeugt eine bearbeitete WAV (48 kHz, Mono, 16 Bit). Die Effekte sind eingebaute Prozessoren; fremde Audio-Unit-Plug-ins werden nicht geladen.

## Import und Übergabe
Audioimport: WAV, MP3, M4A, AAC, FLAC, OGG, AIFF und WebM; lokale Umwandlung in eine VOICE-WAV. Die Quelldatei bleibt bestehen.

BRINK: Zunächst unter Script ein Projekt anlegen und dem Take zuordnen. In „Take verwalten“ einen bestehenden BRINK-Projektordner verbinden. „An BRINK übergeben“ kopiert die WAV kollisionsfrei in `media/sounds` dieses Projekts.

CINE: „Für CINE speichern“ erzeugt ein separates `.brinkvideo`-Projekt und eine WAV daneben. Beide Dateien zusammen aufbewahren. Das Projekt lässt sich in CINE öffnen; vorhandene CINE-Projekte werden dabei nicht bearbeitet.

## Prüfung
`npm test`: Audio- und Persistenztests einschließlich echter FFmpeg/RNNoise-Verarbeitung, MP3-Import, Abbruch und zehnminütigem Take.
`npm run test:smoke`: simuliertes Mikrofon durch den vollständigen AudioWorklet-Aufnahmepfad, Pause, Wellenform, Schnittgrenzen, Wiedergabe, Export und Fenstergrößen.
`npm run test:studio`: Scripts, Projekte, Take-Verwaltung, echte Zeigerbedienung freier Schnitte, Verlauf, Zoom, Effektvorschau, A/B, lokale Übergabe und Wiederherstellung nach Neuladen.

Die automatisierten Tests nutzen synthetische Audiodaten. Klangvorlagen sind mit der eigenen Stimme abzuhören; physische Mikrofon- und Bluetooth-Kombinationen werden damit nicht vollständig abgedeckt.

## Audio in Text umwandeln

Take in der linken Liste auswählen und **Transkribieren** anklicken. Das funktioniert mit eigenen Aufnahmen und importierten Audiodateien. Sprache auswählen (Deutsch ist voreingestellt, automatische Erkennung ist verfügbar) und starten. Whisper Base läuft mit whisper.cpp vollständig lokal. Modell und Engine liegen der macOS-App für Apple Silicon bei; kein API-Schlüssel, kein Audio-Upload und kein zusätzlicher Download beim Start. Unterstützte Take-Länge: 0,2 Sekunden bis 2 Stunden.

Ein Fortschritt zeigt den laufenden Auftrag. **Abbrechen** beendet ihn; ein früheres Transkript bleibt erhalten. Eine erneute Transkription fragt vor dem Ersetzen nach. Nach erfolgreicher Erkennung lässt sich der Text direkt korrigieren; Änderungen werden automatisch gespeichert und auch als ausstehender Entwurf gesichert. **Text kopieren**, **TXT exportieren** und **Als neues Script öffnen** verwenden den korrigierten Text. Ein neues Script ersetzt keine vorhandenen Scripts. Im Anschluss kann der Text über **In Record ablesen** im Teleprompter verwendet werden.

Transkripte liegen lokal in `VOICE/Transcripts`. Sie werden zusammen mit dem zugehörigen Take gelöscht. Bearbeitete Audio-Ergebnisse sind eigene Takes und erhalten bei Bedarf ihre eigene Transkription.

Whisper kann sich bei Namen, leiser Sprache, Akzenten oder Nebengeräuschen irren. Das Base-Modell priorisiert kurze Wartezeiten; den Text vor Veröffentlichung gegenhören. Die Transkription übersetzt nicht und unterscheidet keine Sprecher.

Entwicklungssetup: `npm run setup:whisper` lädt die gepinnte Engine-Quelle und das per Prüfsumme verifizierte Base-Modell und baut die native CLI. Benötigt macOS Apple Silicon, Xcode Command Line Tools, CMake, Git, curl und Node. Die Runtime unter `runtime/whisper` wird nicht in Git abgelegt; `npm run build` prüft sie und nimmt sie als App-Ressource auf. Andere Plattformpakete benötigen eine eigene passende Whisper-Runtime und werden aktuell vom Build-Check abgelehnt.

`npm run test:transcription` prüft echte lokale Spracherkennung, Korrekturen, Zwischenablage, TXT-Export, Script/Teleprompter, Abbruch, Ersatzbestätigung und Neustart-Persistenz. Die englische Testaufnahme stammt aus den whisper.cpp-Beispielen (JFK-Rede). Zusätzlich wurde eine lokal synthetisierte deutsche Sprachprobe geprüft; Eigennamen und einzelne Wörter benötigen gegebenenfalls Korrektur.
