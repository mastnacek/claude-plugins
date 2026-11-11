# Slice: report

## Proč existuje

Co plugin zjistil, musí být vidět: scorecard na požádání a krátký štítek pod promptem. Kdyby řez zmizel, deník
a skóre existují dál, jen je nikdo nevidí.

## Co dělá

- `startReport` (volá kořen při `session.start`) — zaregistruje příkaz `/watch`.
- `command.run {watch}`:
  - `/watch report` — scorecard tohoto sezení; `last` = předchozí sezení projektu (nejnovější deník, který není tohoto sezení); `all` = jeden řádek za sezení;
    `<id>` = sezení podle prvních znaků id (velikost písmen se nerozlišuje). Čte deníky ze složky projektu a vyhodnotí je `shared/judge`
    s konfigurací projektu.
  - `/watch rules` pošle dolů (odpovídá `rules`); cokoli jiného vrátí řádek použití.
  - Modelu jde **jen první řádek** (`Watchdog · sezení a1b2c3d4 (coder): skóre 85/100, 2 porušení`); celý výstup je data v `commandOutputs`.
- `ui.render CommandOutput {watch}` — rámeček (`round`), hlavička `👁 Watchdog · …` tučně, řádky barvou podle významu: instant failure `error`
  (`⛔ INSTANT FAIL · W01 · 13:05:09 · důkaz`), porušení `warning` (`⚠ −10 · W04 · čas · důkaz`), souhrn dim, bez porušení `✔` zeleně.
  Rámeček: červený při instant failure, žlutý s porušením, zelený bez nich. Bez dat `next(e)` — engine nakreslí holý text.
- **Fakty UMA v kontextu** (jen když vedle deníku leží sidecar `….uma.jsonl` z `cc-uma-memory`, viz kontrakt níž): ke každému porušení přibude dim řádek `   🧠 fakty v kontextu: <id8>, … (+N)` (fakty doručené do času porušení, nejvýš 6, `id8` = prvních 8 znaků ID) a v souhrnu řádek `🧠 sezení mělo N faktů UMA v kontextu` (1 fakt / 2–4 fakty / 0 a 5+ faktů; „porušení“, „volání“, „sezení“ se neskloňují). Bez sidecaru, bez čitelného řádku nebo při chybě čtení se scorecard nemění. Čte `shared/uma.ts`; modelu jde dál jen první řádek.
- `ui.render PromptHint` — štítek na konec `tail` se semaforem, cizí tail zůstane: `[👁 🟢 100]` (bez porušení), `[👁 🟡 85 ⚠️2]` (⚠️ = počet porušení), `[👁 🔴 0 ⛔]` při instant failure.
  Čte jen `verdict`; nepíše. Barvu tailu určuje engine (tlumená), proto je stav vidět z emoji.

## Kontrakt

- **Čte:** `verdict` (píše `rules`), `commandOutputs`, deníky (soubory) a volitelně sidecar `<deník>.uma.jsonl`.
- **Sdílený kontrakt souboru s `cc-uma-memory`** (jediné, co pluginy sdílejí; žádný import, každý má vlastní kód): soubor `<kořen>/<projekt>/<datum>_<role>_<id8>.uma.jsonl` (stejná složka a jméno jako deník, přípona `.uma.jsonl`), řádek
  `{"ts":<ms>,"session":"<id>","kind":"uma-context","source":"recall"|"rules","factIds":["<id>",…],"scope":"prompt"|"session"}`; jen ID, nikdy obsah faktů. Píše ho `cc-uma-memory`, tady se jen čte (`shared/uma.ts`).
- **Píše:** `commandOutputs` (klíč = první řádek výstupu, nejvýš 20 záznamů).

## Nepatří sem

| co | kam patří |
|---|---|
| pravidla, skóre, tokenizace | `shared/` |
| zápis deníku, přepočet skóre | `ledger`, `rules` |
| `/watch rules` | `rules` |
| cokoli, co volání zamítne nebo změní | nikam |

## Pasti

- `id8` je prvních 8 znaků ULID, tedy hrubý čas vzniku faktu; dva fakty vzniklé v téže sekundě mají stejné `id8`. Ke konkrétnímu faktu se dojde přes `/uma search`/`read` v UMA, ne tady.
- Fakty „v kontextu“ jsou kumulativní: co bylo doručeno do času porušení, i když to model v dalším tahu už nemusel mít (po `/compact`).

- Text příkazu pluginu jde do požadavků modelu — proto první řádek a zbytek v `$.state`; dva výstupy se stejnou první řádkou se přepíšou.
- `/watch report` neumí zapsat do deníku; scorecard vždy čte soubor (včetně právě rozepsaného).
- Atomy `commandOutputs`/`verdict` se deklarují v každém souboru, který je čte; klíč, výchozí hodnota a `shape` se musí shodovat s `rules`.
- Barvy jsou jmenované (`error`, `warning`, `success`, `claude`), ne RGB — viz `docs/vystup-v-tui.md`.
