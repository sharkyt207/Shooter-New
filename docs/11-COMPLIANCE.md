# PROJECT ECHO — Datenschutz, Altersfreigabe, Store-Compliance

> Dokument-Status: **verbindlich** · Version 1.0 · Owner: Creative Director
> Grundlage für die Datenschutzangaben bei Apple und Google. Jede Aussage hier
> muss sich im Code nachprüfen lassen — deshalb steht überall, **wo**.

---

## 1. Was die App erhebt: nichts

Das ist die vollständige Antwort, und sie ist nachprüfbar.

| Was | Wo es liegt | Verlässt es das Gerät? |
|-----|-------------|------------------------|
| Spielstand (Lager, Fortschritt, Basis) | `Preferences` / `localStorage`, Schlüssel `profile` | nein |
| Sprachwahl | derselbe Speicher, Schlüssel `locale` | nein |
| Raid-Statistik (Telemetrie) | derselbe Speicher, Schlüssel `telemetry` | nein |

Es gibt **keine** Kennung: keine Geräte-ID, keine Werbe-ID, kein Konto, kein
Login, keine Sitzungskennung. Die Telemetrie enthält Zahlen über Raids, keine
Angaben über die Person, und sie ist auf 50 Raids begrenzt
(`TELEMETRY_CAPACITY`).

**Der Spieler kann sie lesen und löschen.** Hauptmenü → Diagnose. Eine
Datenschutzerklärung, die man nachlesen muss, ist schwächer als ein Bildschirm,
auf dem alles Gespeicherte steht.

### Ausgehende Verbindungen

Genau eine ist möglich, und der ausgelieferte Build macht sie nicht:

`src/platform/config/remoteConfig.ts` lädt eine Balance-Konfiguration per GET —
**nur**, wenn `VITE_BALANCE_CONFIG_URL` beim Bauen gesetzt war. Es gibt keine
Vorgabe-URL. Ist die Variable leer, existiert kein Netzwerkpfad im Programm.

Auch mit gesetzter URL wird nichts *gesendet*: kein Cookie
(`credentials: 'omit'`), keine Kennung, kein Nutzdatenkörper. Der Server erfährt
eine IP-Adresse, wie jeder Server, von dem eine Datei geladen wird.

### Antworten für die Store-Formulare

| Frage | Antwort |
|-------|---------|
| Apple: „Data Used to Track You" | **Keine** |
| Apple: „Data Linked to You" | **Keine** |
| Apple: „Data Not Linked to You" | **Keine** |
| Apple: App Tracking Transparency nötig? | **Nein** — es wird nicht getrackt |
| Google Play Data Safety: erhobene Daten | **Keine** |
| Google Play: verschlüsselte Übertragung | Entfällt — es wird nichts übertragen |
| Google Play: Löschmöglichkeit | Ja, im Spiel (Diagnose → Aufzeichnung löschen) |
| Werbe-SDKs / Analyse-SDKs | **Keine.** Abhängigkeiten: siehe ADR-012 |
| Käufe in der App | **Keine** |

> **Sobald sich das ändert, ändert sich diese Tabelle zuerst.** Ein
> Analyse-Dienst, eine Absturzmeldung, ein Konto — jedes davon macht aus „Keine"
> eine Liste und ist deshalb eine Produktentscheidung, keine technische.

---

## 2. Altersfreigabe

**Zielbewertung: USK 12 / PEGI 12 / App Store 12+ / Google Play Teen.**

Begründung im Detail steht in `docs/10-STORE-LISTING.md`. Die tragenden Punkte:

| Kriterium | Umsetzung im Spiel |
|-----------|--------------------|
| Gewaltdarstellung | Isometrisch, stilisiert, auf Distanz. Keine Nahaufnahmen, keine Verstümmelung |
| Blut | Keine Blutlachen, keine Wundtexturen. Treffer sind ein Aufblitzen und eine Zahl |
| Menschliche Ziele | Fraktionen sind fiktive Überlebende und Verwobene; keine reale Gruppe, kein realer Konflikt |
| Sprache | Keine Kraftausdrücke in beiden Sprachfassungen |
| Angst/Schrecken | Anspannung und Einsamkeit, keine Schreckmomente, keine Horror-Bildsprache |
| Glücksspiel | **Keine** Lootboxen, keine Zufallskäufe, keine Währung für Echtgeld |
| Interaktion mit Fremden | Keine. Einzelspieler, kein Chat, keine Bestenliste (ADR-006) |
| Nutzergenerierte Inhalte | Keine |

Die letzten drei Zeilen sind der Grund, warum eine 12er-Einstufung realistisch
ist: Was Bewertungen üblicherweise nach oben treibt, ist bei einem Einzelspieler
ohne Käufe und ohne Chat schlicht nicht vorhanden.

---

## 3. Rechtliches

| Punkt | Stand |
|-------|-------|
| Datenschutzerklärung | Muss als URL vorliegen — beide Stores verlangen sie, auch wenn nichts erhoben wird. Text: Abschnitt 1 dieses Dokuments |
| Impressum | Erforderlich (DE), abhängig von der herausgebenden Person/Firma — **offen** |
| Lizenzen Dritter | PixiJS (MIT), Capacitor (MIT). Keine weiteren Laufzeitabhängigkeiten (ADR-012) |
| Schriftarten | Systemschriften, keine eingebettete Lizenz nötig |
| Audio | Vollständig prozedural erzeugt, keine Fremdaufnahmen (`docs/modules/audio.md`) |
| Grafik | Eigenerzeugt (Canva-Emblem, prozedurale Platzhalter) — bei Ersatz durch Auftragsarbeit Nutzungsrechte schriftlich |
| DSGVO-Auftragsverarbeitung | Entfällt, solange nichts erhoben wird |
| Einwilligungsbanner | Entfällt aus demselben Grund |

---

## 4. Was vor dem Release noch fehlt

Ehrlich getrennt nach dem, was **diese Umgebung** leisten kann, und dem, was sie
nicht kann.

**Umsetzbar, offen:**

- Splash-Screen (2732×2732) und Play-Symbolbild (1024×500)
- Screenshots in den geforderten Formaten (Plan in `docs/10-STORE-LISTING.md`)
- Englische Fassung der Store-Texte
- Datenschutz-URL veröffentlichen

**Braucht einen Mac oder ein Konto — siehe `docs/modules/platform-mobile.md`:**

- `npx cap add ios`, erster Xcode-Build, Signierung, TestFlight
- Play Console: internes Testgleis, Signaturschlüssel
- Test auf echter Hardware — jede Leistungszahl aus dieser Umgebung ist
  Software-Rendering und zählt nicht
