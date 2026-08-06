/**
 * English catalogue.
 *
 * Keyed by the German source string (see `core/i18n/i18n.ts` for why). A
 * missing entry falls back to German, so this file can never break a screen —
 * only leave one word untranslated. `i18n.test.ts` fails when a call site has
 * no entry here, which is what stops "only leave one word" from quietly
 * becoming half the game.
 *
 * Translation notes, so the tone survives:
 *
 * - The game speaks plainly and slightly coldly. Not military jargon, not
 *   fantasy. "Riss" is **rift**, not "crack" or "tear".
 * - Item and place names are translated, ids never are.
 * - Where German uses "du", English uses the imperative or a bare "you". No
 *   "please", no exclamation marks.
 * - Short strings on buttons must stay short: a HUD button is 58 px wide.
 */

import type { Catalogue } from '@/core/i18n/i18n';

export const EN: Catalogue = {
  // ── Brand and menu ───────────────────────────────────────────────────────
  'Project Echo': 'Project Echo',
  'Die Realität ist zerbrochen. Geh hinein. Komm zurück.':
    'Reality is broken. Go in. Come back.',
  'Riss betreten': 'Enter the rift',
  'Neues Profil': 'New profile',
  Weiter: 'Continue',
  Operator: 'Operator',
  Stufe: 'Level',
  Guthaben: 'Credits',
  Raids: 'Raids',
  Extraktionen: 'Extractions',
  Verluste: 'Losses',
  'Bester Fund': 'Best haul',
  'Version {version} · Meilenstein {milestone}': 'Version {version} · Milestone {milestone}',

  // ── Base ─────────────────────────────────────────────────────────────────
  Basis: 'Base',
  Lager: 'Stash',
  Handel: 'Trade',
  Werkbank: 'Workbench',
  Ausbau: 'Upgrades',
  'Ausrüstung wählen': 'Choose loadout',
  'Das Lager ist leer.': 'The stash is empty.',
  'Versicherung unterwegs': 'Insurance in transit',
  'Die Karte ist vollständig. Vorerst.': 'The map is complete. For now.',
  'Maximale Stufe': 'Max level',
  gesperrt: 'locked',
  'Im Bau': 'Building',
  'In Arbeit': 'In progress',
  'Nichts in Arbeit.': 'Nothing in progress.',
  'Keine Rezepte verfügbar. Werkbank ausbauen.':
    'No recipes available. Upgrade the workbench.',
  'Nichts im Lager.': 'Nothing in the stash.',
  Bauen: 'Craft',
  sofort: 'instant',
  fertig: 'done',
  '{percent} % Fehlschlag': '{percent} % failure',
  '{done} / {total}': '{done} / {total}',

  // ── Trading ──────────────────────────────────────────────────────────────
  Verkaufen: 'Sell',
  Kaufen: 'Buy',
  Angebot: 'Stock',
  Aufträge: 'Contracts',
  Abgeben: 'Hand in',
  Erledigt: 'Done',
  'Zurzeit nichts zu erledigen.': 'Nothing to do right now.',
  'Nichts zu verkaufen.': 'Nothing to sell.',
  '{trader} kauft davon nichts.': '{trader} buys none of that.',
  'Ruf {tier}': 'Rep {tier}',
  'noch {points}': '{points} to go',
  'höchste Stufe': 'highest tier',

  // ── Loadout ──────────────────────────────────────────────────────────────
  Ausrüstung: 'Loadout',
  Risiko: 'At risk',
  Waffe: 'Weapon',
  Rüstung: 'Armour',
  Helm: 'Helmet',
  Rucksack: 'Backpack',
  Munition: 'Ammunition',
  Mitnehmen: 'Pack',
  'Sicherer Behälter': 'Secure case',
  'Im sicheren Behälter': 'In the secure case',
  'Kommt zurück - auch wenn du es nicht tust.': 'It comes back. Even if you do not.',
  Versicherung: 'Insurance',
  'Braucht das Modul Medizin.': 'Requires the Medical module.',
  Versichert: 'Insured',
  Versichern: 'Insure',
  'Nichts zum Mitnehmen im Lager.': 'Nothing to pack in the stash.',
  'Keine passende Munition im Lager.': 'No matching ammunition in the stash.',
  '— nichts —': '— none —',
  'getragen {weight}': 'worn {weight}',
  'Lager: {count}': 'Stash: {count}',
  'Getragene Ausrüstung kommt bei einem Fehlschlag mit {percent} % Wahrscheinlichkeit nach {minutes} Minuten zurück. Beute nie.':
    'Worn gear returns with {percent} % probability after {minutes} minutes if the raid fails. Loot never does.',

  // ── Workshop ─────────────────────────────────────────────────────────────
  Werkstatt: 'Workshop',
  'Werkstatt öffnen': 'Open workshop',
  Zustand: 'Condition',
  Instandsetzen: 'Repair',
  'Keine Waffe ausgerüstet.': 'No weapon equipped.',
  'Erst eine Waffe wählen.': 'Choose a weapon first.',
  'Keine passenden Teile im Lager.': 'No matching parts in the stash.',
  'Jede Instandsetzung senkt den erreichbaren Höchstzustand. Aktuell maximal {percent} %.':
    'Every repair lowers the reachable maximum condition. Currently at most {percent} %.',

  // ── Briefing ─────────────────────────────────────────────────────────────
  'Riss-Signatur': 'Rift signature',
  Fragmente: 'Fragments',
  Lagebild: 'Situation',
  Bedrohung: 'Threat',
  Wetter: 'Weather',
  'Behälter erfasst': 'Containers detected',
  Anomalien: 'Anomalies',
  Verschlossen: 'Locked',
  Ausgänge: 'Exits',
  Dauer: 'Duration',
  'Erster Ausgang': 'First exit',
  Bedingungen: 'Conditions',
  Warnung: 'Warning',
  'Andere Signatur suchen': 'Find another signature',
  keine: 'none',
  '{count} aktiv': '{count} active',
  'nach {time}': 'after {time}',
  '{count} Kammer': '{count} chamber',
  '{count} Kammern': '{count} chambers',

  // ── HUD ──────────────────────────────────────────────────────────────────
  Nehmen: 'Take',
  Laden: 'Reload',
  Sprint: 'Sprint',
  Nah: 'Melee',
  Nahkampf: 'Melee',
  Licht: 'Light',
  Inventar: 'Inventory',
  Pause: 'Pause',
  LADEHEMMUNG: 'JAMMED',
  'Signal gestört': 'signal jammed',
  Nachladen: 'Reloading',
  Extraktion: 'Extraction',
  'Zustand {percent} %': 'Condition {percent} %',

  // ── Inventory ────────────────────────────────────────────────────────────
  'Der Rucksack ist leer.': 'The backpack is empty.',
  Benutzen: 'Use',
  Ablegen: 'Drop',
  Sichern: 'Secure',
  Schließen: 'Close',
  Gesichert: 'Secured',
  'Lager voll': 'Stash full',

  // ── Pause ────────────────────────────────────────────────────────────────
  Fortsetzen: 'Resume',
  'Raid abbrechen': 'Abandon raid',
  Linkshänder: 'Left-handed',
  Debug: 'Debug',
  Sprache: 'Language',
  'Desktop: WASD bewegen · Maus zielen · Klick feuern · R laden · E interagieren · Tab Inventar':
    'Desktop: WASD to move · mouse to aim · click to fire · R reload · E interact · Tab inventory',

  // ── Result ───────────────────────────────────────────────────────────────
  Bilanz: 'Result',
  Beutewert: 'Haul value',
  'Zurück zur Basis': 'Back to base',
  Extrahiert: 'Extracted',
  Gefallen: 'Lost',
  'Zeit abgelaufen': 'Out of time',
  'Diese Gegenstände passten nicht mehr ins Lager und gingen verloren. Lager ausbauen.':
    'These items no longer fit in the stash and were lost. Upgrade the stash.',

  // ── Toasts ───────────────────────────────────────────────────────────────
  'Zu schwer. Etwas zurücklassen.': 'Too heavy. Leave something behind.',
  'Nicht genug Credits.': 'Not enough credits.',
  'Nicht genug im Lager.': 'Not enough in the stash.',
  'Material fehlt.': 'Materials missing.',
  'Nicht verfügbar.': 'Not available.',
  'Das kauft er nicht.': 'They will not buy that.',
  'Lager voll.': 'Stash full.',
  'Maximale Stufe erreicht.': 'Maximum level reached.',
  'Voraussetzungen fehlen.': 'Requirements not met.',
  'Wird bereits gebaut.': 'Already building.',
  'Unbekanntes Modul.': 'Unknown module.',
  'Unbekanntes Rezept.': 'Unknown recipe.',
  'Werkbank zu niedrig.': 'Workbench level too low.',
  'Werkbank ausgelastet.': 'Workbench at capacity.',
  'Bau begonnen.': 'Construction started.',
  'Ausgebaut.': 'Upgraded.',
  'In Arbeit.': 'Started.',
  'Ausrüstung nicht mehr im Lager verfügbar.': 'That gear is no longer in the stash.',
  'Notausrüstung aus Basisbestand ausgegeben.': 'Emergency gear issued from base stock.',
  'Schloss entriegelt.': 'Lock released.',
  'Verschlossen.': 'Locked.',
  'Verschlossen. Benötigt: {key}': 'Locked. Requires: {key}',
  '{module} Stufe {level} fertig.': '{module} level {level} complete.',
  '{recipe}: fehlgeschlagen, Material teilweise zurück.':
    '{recipe}: failed, some materials returned.',
  '{recipe} fertiggestellt.': '{recipe} complete.',
  'Versicherung: {item} ×{count}': 'Insurance: {item} ×{count}',
  'Versicherung: {count} Teile in {minutes} min zurück.':
    'Insurance: {count} items back in {minutes} min.',
  'Auftrag abgeschlossen: {stage}': 'Objective complete: {stage}',
  'Auftrag erfüllt · +{credits} ¢': 'Contract fulfilled · +{credits} ¢',
  'Ruf gestiegen: Stufe {tier}': 'Reputation up: tier {tier}',
  'Instandgesetzt für {cost} ¢.': 'Repaired for {cost} ¢.',
  '{zone} offen': '{zone} open',
  'Ausgang schließt in {seconds} s': 'Exit closes in {seconds} s',
  'Noch {minutes} Minuten': '{minutes} minutes left',
  'Bitte drehen': 'Please rotate',
  'PROJECT ECHO wird im Querformat gespielt.': 'PROJECT ECHO is played in landscape.',
  'Riss wird kalibriert …': 'Calibrating rift …',
  Startfehler: 'Startup error',
  'Das Spiel konnte nicht gestartet werden.': 'The game could not be started.',

  // ── Content: weapons ─────────────────────────────────────────────────────
  'Splitter VK-2': 'Splitter VK-2',
  'Bruch M9': 'Bruch M9',
  'Nadel LR': 'Nadel LR',

  // ── Content: items ───────────────────────────────────────────────────────
  '9 mm Kern': '9 mm core',
  '9 mm Hohlspitze': '9 mm hollow point',
  '9 mm Stahlkern': '9 mm steel core',
  '7,4 Riss': '7.4 Rift',
  '12 Schrot': '12 buckshot',
  '12 Flintenlaufgeschoss': '12 slug',
  Feldverband: 'Field dressing',
  'Trauma-Kit': 'Trauma kit',
  Stimulans: 'Stimulant',
  Faserweste: 'Fibre vest',
  Verbundplatte: 'Composite plate',
  Umhängetasche: 'Shoulder bag',
  Feldrucksack: 'Field pack',
  Bergungstrage: 'Salvage rig',
  Sicherungskassette: 'Secure case',
  Bergungskassette: 'Salvage case',
  Metallschrott: 'Scrap metal',
  Kupferwicklung: 'Copper winding',
  Schaltkreis: 'Circuit',
  Verbundpolymer: 'Composite polymer',
  'Echo-Splitter': 'Echo shard',
  Datenkern: 'Data core',
  'Riss-Kern': 'Rift core',
  Sicherheitskarte: 'Security card',
  Splittergranate: 'Frag grenade',
  Blendgranate: 'Flashbang',
  Lockmittel: 'Lure',
  'Langlauf VK': 'Long barrel VK',
  Reflexvisier: 'Reflex sight',
  'Erweitertes Magazin': 'Extended magazine',
  Schalldämpfer: 'Suppressor',

  // ── Content: enemies and factions ────────────────────────────────────────
  Plünderer: 'Scavenger',
  'Läufer der Ordnung': 'Order runner',
  Wächter: 'Warden',
  Plünderer_faction: 'Scavengers',
  'Die Ordnung': 'The Order',
  Wächter_faction: 'Wardens',

  // ── Content: anomalies ───────────────────────────────────────────────────
  Stillstand: 'Standstill',
  Flüstern: 'Whisper',
  Rückstoß: 'Recoil',
  Bleiche: 'Bleach',
  'Echo-Schatten': 'Echo shadow',
  'Verlangsamt alles im Radius, auch Geschosse. Der Kern ist tödlich.':
    'Slows everything inside, bullets included. The core is lethal.',
  'Stört Elektronik. Minimap, Munitionsanzeige und Marker fallen aus.':
    'Disrupts electronics. Minimap, ammo counter and markers go down.',
  'Stößt in Wellen alles von sich weg. Wer zu nah ist, wird beschädigt.':
    'Pushes everything away in waves. Anything close takes damage.',
  'Entzieht lautlos Lebensenergie. Man merkt es meist zu spät.':
    'Drains life silently. You usually notice too late.',
  'Spiegelt vergangene Bewegungen. Auch Gegner folgen dem, was sie sehen.':
    'Replays past movement. Enemies follow what they see, too.',

  // ── Content: weather ─────────────────────────────────────────────────────
  Klar: 'Clear',
  Nebel: 'Fog',
  Sturm: 'Storm',
  'Riss-Puls': 'Rift pulse',
  Nachtseite: 'Night side',
  'Ruhige Sicht. Keine Besonderheiten gemeldet.': 'Clear sight. Nothing unusual reported.',
  'Dichter Nebel. Sichtweiten stark reduziert, Geräusche tragen weiter.':
    'Dense fog. Sight ranges heavily reduced, sound carries further.',
  'Sturm. Er schluckt Geräusche - deine wie ihre.':
    'Storm. It swallows sound — yours and theirs.',
  'Der Riss pulsiert. Anomalien sind aktiver als sonst.':
    'The rift is pulsing. Anomalies are more active than usual.',
  'Nachtseite des Fragments. Ohne Licht siehst du nichts - mit Licht sehen sie dich.':
    'Night side of the fragment. Without light you see nothing — with light they see you.',

  // ── Content: base modules ────────────────────────────────────────────────
  Medizin: 'Medical',
  Forschung: 'Research',
  Waffenwerkstatt: 'Gunsmith',
  Schwarzmarkt: 'Black market',
  Händler: 'Trader',

  // ── Content: traders ─────────────────────────────────────────────────────
  Quartiermeister: 'Quartermaster',
  Feldärztin: 'Field medic',
  'Führt Buch. Über alles. Auch über dich.': 'Keeps records. Of everything. Of you as well.',
  'Näht dich zusammen. Über den Preis redet sie nicht zweimal.':
    'Stitches you up. Does not discuss the price twice.',
  'Keine Namen, keine Quittungen, keine zweite Chance.':
    'No names, no receipts, no second chance.',

  // ── Content: quest line ──────────────────────────────────────────────────
  'Kartographie der Risse': 'Cartography of the Rifts',
  'Erster Rückweg': 'First way back',
  'Verlasse einen Riss lebend. Alles Weitere setzt das voraus.':
    'Leave a rift alive. Everything else depends on it.',
  'Freie Bahn': 'Clear the way',
  'Schalte 15 Feinde aus. Die Risse gehören niemandem freiwillig.':
    'Take down 15 enemies. Nobody gives up a rift willingly.',
  'Die Fracht': 'The cargo',
  'Bringe Beute im Wert von 8.000 Credits aus den Rissen zurück.':
    'Bring back 8,000 credits worth of loot from the rifts.',
  'Hinter der verschlossenen Tür': 'Behind the locked door',
  'Öffne eine Sicherheitskammer. Der Schlüssel liegt woanders im Riss.':
    'Open a vault. The key is somewhere else in the rift.',
  Feldstudie: 'Field study',
  'Betritt drei Anomalien und komm lebend wieder heraus.':
    'Enter three anomalies and come out alive.',
  'Eigene Fertigung': 'Own production',
  'Stelle fünf Gegenstände selbst her.': 'Craft five items yourself.',
  'Ein fester Ort': 'A fixed place',
  'Bringe die Werkbank auf Stufe 3. Von hier aus wird kartiert.':
    'Get the workbench to level 3. The mapping starts here.',

  // ── Content: contracts ───────────────────────────────────────────────────
  Materialbeschaffung: 'Material run',
  'Leitfähiges Material': 'Conductive material',
  Munitionsüberschuss: 'Ammunition surplus',
  Verbandsmaterial: 'Dressings',
  Stabilisatoren: 'Stabilisers',
  'Echo-Probe': 'Echo sample',
  'Keine Fragen': 'No questions',

  // ── Content: extraction zones ────────────────────────────────────────────
  'Nahtzone Nord': 'Seam zone north',
  'Bergungspunkt Ost': 'Salvage point east',
  'Riss-Ausgang Süd': 'Rift exit south',
  'Notausstieg West': 'Emergency exit west',

  // ── Content: hints ───────────────────────────────────────────────────────
  'Links laufen, rechts zielen. Der Ausgang öffnet sich erst nach einigen Minuten.':
    'Left thumb moves, right thumb aims. The exit only opens after a few minutes.',
  'Sie haben dich gehört. Sichtlinie brechen wirkt besser als schneller schießen.':
    'They heard you. Breaking line of sight works better than shooting faster.',
  'Deckung ist eine Wand, keine Distanz. Heilen kostet Zeit, in der du nichts kannst.':
    'Cover is a wall, not distance. Healing costs time you cannot act in.',
  'Durchsuchen dauert und macht Geräusche. Halte gedrückt.':
    'Searching takes time and makes noise. Hold to search.',
  'Alles wiegt etwas. Schwer heißt langsam, und langsam heißt tot.':
    'Everything weighs something. Heavy means slow, and slow means dead.',
  'Zu schwer. Entscheide, was wirklich mitkommt — im Inventar ablegen.':
    'Too heavy. Decide what really comes along — drop it in the inventory.',
  'Eine Anomalie. Ihre Farbe sagt dir, was sie tut — und daneben liegt meist etwas Gutes.':
    'An anomaly. Its colour tells you what it does — and something good is usually next to it.',
  'Verschlossen. Der Schlüssel liegt woanders in diesem Riss.':
    'Locked. The key is somewhere else in this rift.',
  'Ladehemmung. Abgenutzte Waffen klemmen — reparieren lohnt sich.':
    'Jammed. Worn weapons stick — repairing pays off.',
  'Ein Ausgang ist offen. Er schließt wieder. Der nächste liegt tiefer im Riss.':
    'An exit is open. It closes again. The next one is deeper in the rift.',
  'Wenig Leben. Mit voller Tasche rauszukommen zählt mehr als der nächste Kill.':
    'Low health. Getting out with a full bag counts for more than the next kill.',
  'Ein Wächter. Er wird schneller, je weniger Leben er hat. Weglaufen ist erlaubt.':
    'A Warden. It gets faster the more it is hurt. Running is allowed.',
  'Die Zeit läuft ab. Wer im Riss bleibt, verliert alles Mitgeführte.':
    'Time is running out. Stay in the rift and you lose everything you carry.',

  // ── Added when the coverage test found them ──────────────────────────────
  ' Signal gestört': ' signal jammed',
  'Nachladen {progress}': 'Reloading {progress}',
  'Stufe {level}': 'Level {level}',
  'Ruf +{points}': 'Rep +{points}',
  'Nicht gebaut': 'Not built',
  '{module} Stufe {level}': '{module} level {level}',
  'Zurück': 'Back',
  Wert: 'Value',
  Gewicht: 'Weight',
  Name: 'Name',
  'Profil wirklich zurücksetzen? Lager und Fortschritt gehen verloren.':
    'Really reset the profile? The stash and all progress will be lost.',
  'Raid abbrechen? Die gesamte mitgeführte Ausrüstung gilt als verloren.':
    'Abandon the raid? Everything you carry counts as lost.',
  an: 'on',
  aus: 'off',
  'Debug-Ansicht': 'Debug view',
  'Linkshänder-Modus': 'Left-handed mode',
  Ausschaltungen: 'Kills',
  Erfahrung: 'Experience',
  Verlust: 'Loss',
  'gesamte mitgeführte Ausrüstung': 'everything you carried',
  'Gerettete Echo-Splitter': 'Echo shards saved',
  Aufstieg: 'Level up',
  Verschollen: 'Missing',
  'über {zone}': 'via {zone}',
  'Beute gesichert': 'Haul secured',
  'Der Riss hat behalten, was du getragen hast.': 'The rift kept what you carried.',
  'Der Riss schloss sich, bevor du draußen warst.':
    'The rift closed before you were out.',
  Schaden: 'Damage',
  Durchschlag: 'Penetration',
  Magazin: 'Magazine',
  Streuung: 'Spread',
  Reichweite: 'Range',
  Lärmradius: 'Noise radius',
  Ergonomie: 'Ergonomics',
  '— leer —': '— empty —',
  Unbewaffnet: 'Unarmed',
  'Teil nicht im Lager.': 'Part not in the stash.',
  'Passt nicht.': 'Does not fit.',
  'Werkbank Stufe 2 nötig.': 'Requires workbench level 2.',
  'Nichts instandzusetzen.': 'Nothing to repair.',

  // ── Content the coverage test found ──────────────────────────────────────
  // Weapon and item names keep their invented model designations: "Nadel PR-9"
  // is a product name, not a description, and translating it would make the
  // catalogue read like two different games.
  'Nadel PR-9': 'Nadel PR-9',
  'Bruch SG-40': 'Bruch SG-40',
  'Plattenträger MK-3': 'Plate carrier MK-3',
  Rohrwaffe: 'Pipe gun',
  Ordenskarabiner: 'Order carbine',
  Wächterlanze: 'Warden lance',

  '9 mm Splitterkern': '9 mm fragmenting core',
  '7,4 Durchschlag': '7.4 penetrator',
  '12er Streu': '12 gauge spread',
  '12er Vollgeschoss': '12 gauge slug',
  '9 mm Kern (30)': '9 mm core (30)',
  '7,4 Riss (20)': '7.4 Rift (20)',
  '9 mm Stahlkern (20)': '9 mm steel core (20)',

  'Echo-Stim': 'Echo stim',
  Schalenhelm: 'Shell helmet',
  Kompensator: 'Compensator',
  Splitterladung: 'Frag charge',
  Blender: 'Flash charge',
  'Echo-Köder': 'Echo lure',
  Sicherheitsschlüssel: 'Security key',
  Platinenmodul: 'Circuit module',
  Forschungsdaten: 'Research data',

  Streuner: 'Stray',
  Ordensläufer: 'Order runner',

  // Base module unlock lines. Kept as terse as the German - they are read at a
  // glance on a small card, not studied.
  Grundlager: 'Basic stash',
  'Erweiterte Regale': 'Extended shelving',
  'Klimatisiertes Depot': 'Climate-controlled depot',
  'Munition und Verbandsmaterial': 'Ammunition and dressings',
  'Rüstungsbau, Präzisionsmunition': 'Armour crafting, precision ammunition',
  'Schwere Munition, geringere Fehlschlagquote': 'Heavy ammunition, lower failure rate',
  'Quartiermeister, Aufträge': 'Quartermaster, contracts',
  'Feldärztin, besserer Ankaufswert': 'Field medic, better buy-in rate',
  'Kontakt zum Schwarzmarkt': 'Black market contact',
  'Herstellung von Feldverbänden, Versicherung': 'Field dressing production, insurance',
  'Trauma-Kits, günstigere Prämien, schnellere Rückgabe':
    'Trauma kits, cheaper premiums, faster returns',
  'Auswertung von Forschungsdaten': 'Research data analysis',
  'Riss-Signaturen vorab lesbar, sichere Behälter':
    'Rift signatures readable in advance, secure cases',
  'Waffenreparatur, Anbauteile fertigen': 'Weapon repair, attachment crafting',
  'Waffenbau, bessere Reparaturobergrenze': 'Weapon crafting, higher repair ceiling',
  'Ankauf ohne Fragen, seltene Ware': 'No-questions buying, rare goods',
  // ── Biomes, threat words and counts ──────────────────────────────────────
  Forschungslabor: 'Research lab',
  'Vergessener Forst': 'Forgotten forest',
  'Frachtterminal Nord': 'Cargo terminal north',
  Transportkiste: 'Transport crate',
  Ausrüstungsspind: 'Equipment locker',
  Sanitätskoffer: 'Medical case',
  'Echo-Depot': 'Echo cache',

  gering: 'low',
  mittel: 'moderate',
  hoch: 'high',
  extrem: 'extreme',
  Behälter: 'Container',
};
