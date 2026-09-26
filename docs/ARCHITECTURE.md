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
