# BRINK-Design in VOICE

Referenz ist `/Users/tom/Developer/brink` sowie der Designvertrag des bestehenden BRINK-Grafikeditors. Die Suite wurde nicht geändert.

- Zentrale `app/css/variables.css` unverändert aus BRINK übernommen.
- Flächen: Hintergrund #17181C, Oberfläche #1F2127, erhöhte Oberfläche #272A31.
- Akzent #6E6BFF, Text #F5F5F7, Sekundärtext #A4A9B6, Border #343842.
- Controls und Karten 14 px Radius; Buttons 42 px hoch, Iconbuttons 42 × 42 px; Icons 20 px.
- Primäre Aktionen in Akzentfarbe, Ordneraktionen semantisch blau, Löschen rot.
- Zusammenhängender Hintergrund mit dezenten BRINK-Verläufen; ruhige Arbeitsflächen.
- Integrierte BRINK-Marke, Systemschrift wie in der Suite; keine abweichende Displayschrift für VOICE.
- Bestehende lokale Material-Symbols-Icons aus BRINK; Play/Pause aus dem BRINK-Videoeditor. Apache-Lizenz liegt unter `app/assets/icons` bei. Schriftlizenzen liegen unter `app/assets/fonts`.
- Dunkel, Hell und System. Keine externen Fonts oder Bilddienste.
- Native Fensterleiste und native Anwendungsmenüs; keine nachgebildeten macOS-Fensterknöpfe.

## Aufbau ab 0.2

Direkte Referenzen: `brink/app/css/layout.css` und `brink/app/css/components/design-system.css`.

- Suite-Hülle mit 8 px Außenabstand, 258 px Sidebar (228 px bei kleinen Fenstern), zentrierter BRINK-Marke mit 176 px Breite.
- Vollflächig akzentfarbener aktiver Navigationseintrag, 15 px Navigationstext.
- Suite-Systemschrift, größere Seitenüberschrift mit bestehendem Icon und akzentfarbene Kartenüberschriften.
- Die gemeinsame radiale und lineare Kartenfüllung stammt aus dem BRINK-Designsystem.
- Aufnahme über die gesamte verfügbare Breite, 190 px hohe Wellenform plus Skala/Kopf; große Zeitanzeige und beschriftete Aufnahmeaktionen.
- Eigene BRINK-Audio-Vorschau statt nativer Audio-Controls. Navigation schaltet echte Ansichten; Skript-Navigation springt zum Arbeitsbereich.
- Skript und Teleprompter bei breiten Fenstern nebeneinander, auf kleinen Fenstern untereinander. Vergrößerter Lesemodus enthält eigene Aufnahmeaktionen.
- Theme-Werte werden an `html` gesetzt, damit alle abgeleiteten Farben mitwechseln.

## Aufbau ab 0.3 (ersetzt den Aufbau 0.2)

Genau zwei Navigationsseiten: Record und Script. Beide füllen die verfügbare Fensterhöhe mit min-height:0 und begrenzten Flex-Flächen. Record und die App-Hülle scrollen nicht. Auf Record gibt es nur Geräteauswahl, flexible Signalanzeige, feste Transportleiste und bei Bedarf Take-Vorschau. Takes liegen in einem Dialog.

Der Schalter „Script anzeigen“ ersetzt innerhalb von Record die große Signalanzeige durch den Lesetext. Der Transport wird kompakt und zeigt eine kleine Live-Wellenform. Es gibt keinen zusätzlichen Vollbildmodus oder Script-Bereich unterhalb der Aufnahme. Script ist ein eigener Editor; nur sein Textfeld scrollt. Dunkel/Hell behalten die zentralen BRINK-Farben, Geometrie und Navigation.

## Ergänzungen 0.4

Die Aufnahmefläche bleibt unverändert groß. Feine zusammenhängende Hüllkurve statt breiter Balken; festes Zehn-Sekunden-Fenster. Pausiert: gelber Status, Zeitanzeige und Hinweis über der eingefrorenen Kurve. Bearbeiten ist ein Dialog über Record mit eigenen BRINK-Transportbuttons, markierten Lücken, drei einfachen Einstellungen und Ergebnisvergleich. Originale werden nicht überschrieben.
