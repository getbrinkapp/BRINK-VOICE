# VOICE

- Eigenständiges Git-/Electron-/Node.js-Projekt im gemeinsamen Workspace unter `/Users/tom/Developer/brink/apps/VOICE`.
- Nur dieses Projekt bearbeiten; BRINK-Suite und andere Editoren dienen als lesbare Referenzen.
- BRINK-Designregeln unter `docs/DESIGN.md` einhalten. Farben/Geometrie zentral, bestehende lokale Material-Symbols-Icons und beiliegende Lizenzen verwenden.
- Renderer: Sandbox, Context Isolation, kein Node-Zugriff, schmale Preload-API und überprüfte IPC-Sender.
- Keine Cloud-Anbindung voraussetzen. Nur Audio: Mikrofon durch eine ausdrückliche Aktion aktivieren. Keine Kamerafunktion oder Kameraberechtigung hinzufügen.
- Aufnahmen laufend sichern; Schreibfehler nicht als erfolgreiches Speichern ausgeben.
- Start `npm start`, Tests `npm test`, End-to-End `npm run test:smoke`, macOS-Paket `npm run build`.
