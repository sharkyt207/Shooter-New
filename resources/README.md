# Native App-Ressourcen

Quelldateien für die Icon- und Splash-Generierung. Capacitor erwartet sie genau
hier, unter genau diesen Namen.

| Datei | Format | Verwendung |
|-------|--------|------------|
| `icon.png` | 1024×1024 PNG | App-Icon für iOS und Android |
| `splash.png` | 2732×2732 PNG | Startbildschirm (fehlt noch, siehe unten) |

## Erzeugen

```bash
npx @capacitor/assets generate --iconBackgroundColor '#080A0F' \
                               --splashBackgroundColor '#080A0F'
```

Der Generator schreibt alle Größen in `ios/` und `android/`. Er braucht die
nativen Projekte, also **einen Mac für iOS** (siehe
`docs/modules/platform-mobile.md`).

## Herkunft

`icon.png` ist das Riss-Emblem aus Canva — dieselbe Datei, die das Hauptmenü als
`ui.emblem` über das Asset-Manifest lädt. Ein Icon und ein Menü-Zeichen, eine
Quelle: Wenn das Emblem ersetzt wird, wird beides ersetzt.

Das Motiv ist bewusst wortlos. Ein App-Icon mit Schrift ist auf einem
Homescreen bei 60 px unlesbar, und die generative Schrifterzeugung produzierte
zuverlässig doppelte Wortmarken — die Schriftzeichnung macht das Spiel selbst,
mit echter Typografie.

## Offen

- `splash.png` (2732×2732): Der Startbildschirm braucht dasselbe Emblem auf
  `#080A0F`, zentriert mit großzügigem Rand. Kann aus `icon.png` erzeugt werden,
  sobald ein Bildwerkzeug verfügbar ist — in dieser Umgebung gibt es weder
  ImageMagick noch Pillow.
