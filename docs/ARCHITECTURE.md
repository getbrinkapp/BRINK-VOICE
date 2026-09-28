# Architektur

Electron 44.3.0 und Node.js; lokales HTML/CSS/JavaScript ohne Web-Framework oder Entwicklungsserver.

- `electron/main.cjs`: Fenster, eng begrenzte IPC-Handler, Gerätefreigaben, native Datei-/Speicherdialoge, lokales `voice:`-Protokoll.
- `electron/preload.cjs`: isolierte API ohne generischen Dateisystem- oder IPC-Zugriff.
- `electron/recordings.cjs`: fortlaufende PCM-Speicherung, WAV-Header, Take-Liste und Wiederherstellung.
- `app/js/pcm-worklet.js`: AudioWorklet, Mono-Mix, PCM16-Konvertierung, Pause ohne Samples, Bestätigung nach Flush.
- `app/js/app.js`: Audioeingang, Pegel, Aufnahmesteuerung, sequenzielle Schreibwarteschlange, Teleprompter, Entwurf und Takes.
- `app/js/core.mjs`: reine Text-/Zeitfunktionen.

Der Renderer hat Sandbox und Context Isolation, keinen Node-Zugriff, eine restriktive CSP und kann keine Fenster öffnen oder zu fremden Seiten navigieren. Berechtigungen und IPC gelten nur für das Hauptfenster und dessen exakte App-Adresse. Dateipfade von Takes werden ausschließlich aus validierten IDs erzeugt. Skripte werden als Text dargestellt, nie als HTML. Importe werden ausschließlich über einen nativen Dateidialog autorisiert, Exporte über einen Speicherdialog.

Mikrofonzugriff beginnt beim Aktivieren oder Aufnahmestart. Keine Berechtigungsanfragen beim reinen Öffnen. Die App fordert keine Kamera an; Kamera-IPC wird abgelehnt, und Videofreigaben werden im Permission-Handler verweigert.

`electron/audio-response.cjs` beantwortet Audioanfragen mit korrekten Content-Type-, Content-Length-, Accept-Ranges- und Content-Range-Headern. Byte-Range-Requests werden tatsächlich aus der Datei gelesen. Damit funktionieren Positionswechsel in Chromium zuverlässig. `Recordings.waveform` erstellt maximal 1200 Peak-Werte aus PCM16 und liest lange Takes blockweise. Die Vorschau verwendet einen einzigen Player; neue Aufnahmen pausieren ihn und sperren Wiedergabe sowie Positionswechsel. Der Teleprompter-Lesemodus bietet eigene Aufnahmeaktionen.

Offizielle API-Referenzen (bei Implementierung geprüft):
- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/api/system-preferences
- https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet

Grenzen der ersten Version: keine Audiobearbeitung, Mehrspuraufnahme, Kompressoren, automatische Transkription oder automatische Sprachverfolgung. Der Teleprompter scrollt mit einstellbarer Geschwindigkeit. Keine PDF-/DOCX-Importe. Für eine öffentliche macOS-Distribution sind Signierung/Notarisierung und Tests mit realer Hardware erforderlich.

## 0.3: Eingangssignal und feste Seiten

`chooseInput` respektiert gespeicherte Geräte und umgeht sonst virtuelle Standard-Recorder, wenn ein physischer Eingang vorhanden ist. Der AudioContext verwendet seine native Rate. Der Worklet bestätigt Start/Pause/Stopp und liefert Peak/RMS auch vor Aufnahmestart. Pegel und Live-Verlauf beruhen somit auf demselben Signal wie die WAV-Samples. Die Anzeige verändert keine Aufnahmesamples.

`input-status.cjs` liest auf macOS über den festen Systembefehl ioreg ausschließlich den Deckelstatus und gibt ihn zusammen mit der Mikrofonfreigabe zurück. Keine benutzerdefinierten Argumente oder Änderungen an Systemeinstellungen. Geschlossener Deckel plus internes MacBook-Mikrofon verhindert den Aufnahmestart mit einer konkreten Meldung. Ausbleibende Signale werden separat angezeigt.

Record/Script sind gegenseitig ausschließende Seiten. Script-Lesemodus liegt innerhalb von Record; Canvas-Größen folgen der verfügbaren Flex-Fläche. Take-Archiv als nativer HTML-Dialog. Vorhandene Audio- und Entwurfsdaten bleiben kompatibel.

## 0.4.1: Anpassbare Pausenschnitte

`app/js/cuts.mjs` begrenzt manuelle Änderungen auf Dateigrenzen und benachbarte Schnitte und rundet in Samples. Die Vorschau hält einen automatisch erkannten Referenzstand und die bearbeiteten Grenzen; Maus-, Tastatur- und Zeiteingaben aktualisieren dieselbe Schnittliste. Änderungen machen eine bereits erzeugte Exportvorschau ungültig. Der IPC `clean-silence` nimmt optional Schnittgrenzen in Sekunden entgegen. `silence.applyCuts` validiert Anzahl, Reihenfolge, Überlappung, endliche Zahlen, Dateigrenzen und verbleibende Audiodaten, bevor die Datei geschrieben wird. Der WAV-Export und die Herkunftsmetadaten verwenden genau diese validierten Schnittgrenzen. Originaldateien bleiben erhalten.

## 0.5: Take-Bibliothek und vereinfachte Darstellung

Die Take-Liste liegt dauerhaft in der Sidebar; Auswahl und Wiedergabestatus werden mit dem vorhandenen Preview-Player synchronisiert. Während Aufnahme oder Geräteaktivierung sind Take-Aktionen gesperrt. Neue und bereinigte Takes aktualisieren die Liste; Löschen nutzt weiterhin die native Bestätigung.

Der Editor stellt die interne samplegenaue Schnittliste mit einer Nachkommastelle dar. Weniger/mehr entfernen nutzt dieselbe validierte Anpassungsfunktion wie Ziehen und Tastatur. Die Stellen-Vorschau spielt das Original mit 0,4 s Kontext vor/nach der Pause und stoppt danach. Statusflächen haben semantische Farben, Text und Symbole; es gibt keine nur durch Farbe übermittelte Information.

## Studio 0.6

`electron/audio-jobs.cjs` verwaltet jeweils einen Hintergrundauftrag. `audio-worker.cjs` rendert Schnitte, RNNoise und FFmpeg-Effekte außerhalb des Hauptprozesses mit Abbruch und Fortschritt. Keine Shell-Aufrufe: Filter entstehen ausschließlich aus begrenzten Zahlen/Booleans in `audio-settings.cjs`. Ergebnisse werden erst nach erfolgreichem Abschluss atomar als neue Takes sichtbar; Originale bleiben unverändert. Temporäre Hörproben liegen separat im AudioCache und verwenden Byte-Range-Wiedergabe über `voice://preview`. FFmpeg liegt ausführbar außerhalb von app.asar, RNNoise als eingebettetes WASM im Paket.

`library.cjs` schreibt Scripts/Projekte atomar und sequenziell, `Recordings.patchMetadata` Take-Metadaten. `library-ui.mjs` verwaltet Auswahl, Filter und Entwürfe; ausstehende Scriptänderungen überleben Neuladen über localStorage. `editor.mjs` und `edit-model.mjs` implementieren Pausen-/Freischnitte, bis zu 100 Undo-Schritte, Vorlagen, A/B-Zeitabbildung und fensterweise Waveform-Abfragen für Zoom.

`handoff.cjs` prüft bestehende BRINK-Projektordner und kopiert WAV-Dateien nach media/sounds ohne bestehende Dateien zu überschreiben. CINE erhält ein eigenes, schema-kompatibles Projekt mit einer Audiospur und WAV-Begleitdatei. Keine unbestätigten Deep-Link-Protokolle.

## Lokale Transkription 0.7

`transcription.cjs` verwaltet native Whisper-Prozesse, lokale Ergebnisse und Abbruch. Die Hauptprozess-IPC erlaubt ausschließlich bekannte Take-IDs und ausgewählte Sprachcodes. Audio wird mit FFmpeg zu 16-kHz-Mono-PCM gewandelt; die Originaldatei bleibt bestehen. Die fest gepinnte lokale whisper.cpp-CLI schreibt JSON in einen temporären Ordner. Struktur, Zeitangaben und Textgrößen werden validiert. Das Ergebnis wird atomar unter Transcripts gespeichert; Fehler und Abbruch ersetzen bestehende Texte nicht. Metal ist aktiviert, mit CPU-Wiederholung bei einem Fehler. Es werden keine Audiodaten an Netzwerkdienste geschickt.

Aufnahme, Effektrendern und Transkription sind gegenseitig gesperrt. Beim Fenster-Schließen wird auf die laufende Arbeit hingewiesen; Renderer-Abbruch beendet den Kindprozess. Temporäre Audiodateien werden im Abschluss und beim nächsten Start entfernt. Der Renderer bietet Fortschritt, Textkorrektur mit serialisierten Schreibvorgängen, lokalen Entwurf, Kopieren, TXT-Export und Übernahme in ein neues Script. Das Modell ist eine separate App-Ressource außerhalb von app.asar; der Build prüft SHA-256-Hashes aus der Runtime-Manifestdatei.
