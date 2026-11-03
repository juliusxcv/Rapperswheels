# Rapperswheels – Website

Statische One-Page-Website (HTML/CSS/JS, kein Build nötig).

## Fotos & Clips hinzufügen

1. Dateien (`.jpg`, `.png`, `.mp4`, `.webm`, `.mov`) in `assets/Photos` ablegen.
2. Skript ausführen:

   ```
   powershell -ExecutionPolicy Bypass -File tools\update-media.ps1
   ```

Das Skript verkleinert die Fotos für das Web (`assets/media`), erstellt Vorschaubilder
und aktualisiert `media.js`. Danach erscheinen sie automatisch in der schwebenden
Fotowand und in der Fotowand-Sektion. Clips werden unverändert kopiert – vorher am
besten auf max. ~20 MB komprimieren.

## Einstellungen

Oben in `main.js`:

- `email` – Empfängeradresse für Kontakt- und Mitgliedschaftsanfragen.
- `formEndpoint` – optional ein Formular-Dienst (z.B. Formspree). Leer lassen = das
  Formular öffnet das Mailprogramm mit vorausgefüllter Nachricht.

## Lokal ansehen

```
python -m http.server 5173
```

dann http://localhost:5173 öffnen.
