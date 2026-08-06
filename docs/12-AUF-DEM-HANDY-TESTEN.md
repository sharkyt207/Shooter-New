# Auf dem Handy testen

> Dokument-Status: **Anleitung** · Für den Fall „ich will das jetzt spielen"

Es gibt drei Wege auf ein Telefon. Zwei davon brauchen einen Mac oder ein
Entwicklerkonto. Der erste braucht nur einen Browser — und deshalb ist er
gebaut.

---

## Weg 1: Als App über den Browser (funktioniert sofort)

Das Spiel ist eine **installierbare Web-App**. Nach dem Öffnen der Adresse legst
du sie auf den Startbildschirm; danach hat sie ein eigenes Symbol, ein eigenes
Fenster ohne Browser-Leiste und startet auch ohne Netz.

### Adresse

```
https://sharkyt207.github.io/Shooter-New/
```

### Einmalig einschalten

GitHub Pages muss einmal auf den Zweig zeigen, sonst antwortet die Adresse mit
404:

**Settings → Pages → Build and deployment → Source: „Deploy from a branch"
→ Branch: `gh-pages` / `(root)` → Save.**

Nach ein bis zwei Minuten ist die Adresse erreichbar.

### Warum ein Zweig und nicht der Actions-Ablauf

`.github/workflows/deploy-pages.yml` existiert und ist richtig — er bekommt nur
keinen Runner. Der erste Lauf stand fünfzehn Minuten mit `runner_id: 0` in der
Warteschlange und wurde dann von GitHub abgebrochen; der `deploy`-Job wurde
übersprungen. Das passiert, wenn GitHub Actions für das Konto nicht
freigeschaltet ist oder das Ausgabenlimit auf 0 steht. Für ein öffentliches
Repository sind Actions kostenlos, aber die Freischaltung muss stimmen:
*Settings → Actions → General* und https://github.com/settings/billing.

Solange das so ist, veröffentlicht der Zweig `gh-pages` ohne Runner:

```bash
npm run publish:pages
```

Das prüft, baut, legt die Ausgabe auf den Zweig und pusht. Der Zweig ist
verwaist (*orphan*) — er enthält nur die Ausgabe, keinen Quelltext, und seine
Historie vermischt sich nie mit dem Entwicklungszweig.

Sobald Actions läuft, übernimmt der Ablauf wieder von selbst und dieses Skript
wird überflüssig statt falsch.

### Auf den Startbildschirm legen

**iPhone (Safari — es *muss* Safari sein, Chrome auf iOS kann es nicht):**
1. Adresse öffnen
2. Teilen-Symbol (Quadrat mit Pfeil nach oben)
3. **Zum Home-Bildschirm**
4. Hinzufügen

**Android (Chrome):**
1. Adresse öffnen
2. Menü ⋮
3. **App installieren** bzw. **Zum Startbildschirm zufügen**

Danach: **Telefon quer halten.** Das Spiel ist Querformat; im Hochformat zeigt
es einen Dreh-Hinweis statt einer Weigerung.

### Was dabei funktioniert und was nicht

| | Web-App | Native App (Weg 2/3) |
|---|---|---|
| Spielen, Touch-Steuerung | ✅ | ✅ |
| Ton | ✅ (nach der ersten Berührung — Browser-Regel) | ✅ |
| Start ohne Netz | ✅ | ✅ |
| Eigenes Symbol, kein Browser-Rahmen | ✅ | ✅ |
| Spielstand bleibt | ✅, aber **löschbar** — siehe unten | ✅ (UserDefaults) |
| Vibration | Android ✅ · iOS ❌ | ✅ |
| Querformat erzwungen | Android ✅ · iOS ❌ (Hinweis) | ✅ |

> **Zum Spielstand:** Im Browser liegt er in `localStorage`, und iOS löscht den,
> wenn der Speicher knapp wird oder die App sieben Tage ungenutzt bleibt. Für
> einen Test ist das in Ordnung; genau deshalb gibt es für die native Fassung
> den Capacitor-Preferences-Adapter (ADR-015).

### Neue Fassung holen

Die App holt sich beim Start die neueste Fassung, sobald Netz da ist. Wenn du
sichergehen willst: App schließen (aus dem App-Umschalter wischen) und neu
öffnen. Welcher Build läuft, steht auf **Diagnose** unter *Build*.

---

## Weg 2: Android als echte App (APK)

Braucht Java 17 und das Android SDK, kein Mac.

```bash
npm install @capacitor/android
npx cap add android
npm run cap:android          # baut, synchronisiert, öffnet Android Studio
```

Dort *Build → Build APK*, die Datei aufs Telefon kopieren, „Installation aus
unbekannten Quellen" erlauben. Oder mit angeschlossenem Telefon:

```bash
npx cap run android
```

---

## Weg 3: iPhone als echte App

Braucht einen Mac mit Xcode, CocoaPods und ein Apple-Entwicklerkonto (für den
Test auf dem eigenen Gerät genügt ein kostenloses Konto, die Signatur läuft dann
nach sieben Tagen ab).

Die exakte Befehlsfolge steht in `docs/modules/platform-mobile.md`. Sie ist
bewusst dort und nicht hier: Sie ist ungetestet, weil diese Umgebung Linux ist,
und ungetestete Anweisungen gehören zu ihrem Modul, nicht in eine Anleitung, die
so aussieht, als sei sie erprobt.

---

## Selbst prüfen, bevor du auf das Telefon schaust

```bash
npm run build
npm run smoke:pwa
```

Das Skript liefert `dist/` **unter einem Unterpfad** aus — genau wie GitHub
Pages unter `/Shooter-New/` — und prüft in einem Telefon-Ansichtsfenster:

1. Manifest ladbar, Symbole in 192 und 512 vorhanden, `apple-touch-icon` da
2. Service Worker aktiv
3. **Start ohne Netz**

Der dritte Punkt ist der, der sich sofort ausgezahlt hat: Beim ersten Lauf war
der Bildschirm offline schwarz. Der Worker hatte die HTML-Datei im Cache, aber
nicht die Bundles — als er aktiv wurde, hatte die Seite sie längst geladen, also
sah sein `fetch`-Zweig sie nie. Er liest sie jetzt beim Installieren aus
`index.html`.

Der Unterpfad ist ebenfalls kein Zierrat: Ein einziger absoluter Pfad im Build
funktioniert lokal tadellos und bricht auf GitHub Pages.
