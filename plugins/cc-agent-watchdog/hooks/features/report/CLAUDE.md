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
- `ui.render PromptHint` — štítek na konec `tail`, cizí tail zůstane: `[👁 85]`, `[👁 85 ⚠2]` (⚠ = počet porušení), `[👁 0 ⛔]` při instant failure.
  Čte jen `verdict`; nepíše.

## Kontrakt

- **Čte:** `verdict` (píše `rules`), `commandOutputs`, deníky (soubory).
- **Píše:** `commandOutputs` (klíč = první řádek výstupu, nejvýš 20 záznamů).

## Nepatří sem

| co | kam patří |
|---|---|
| pravidla, skóre, tokenizace | `shared/` |
| zápis deníku, přepočet skóre | `ledger`, `rules` |
| `/watch rules` | `rules` |
| cokoli, co volání zamítne nebo změní | nikam |

## Pasti

- Text příkazu pluginu jde do požadavků modelu — proto první řádek a zbytek v `$.state`; dva výstupy se stejnou první řádkou se přepíšou.
- `/watch report` neumí zapsat do deníku; scorecard vždy čte soubor (včetně právě rozepsaného).
- Atomy `commandOutputs`/`verdict` se deklarují v každém souboru, který je čte; klíč, výchozí hodnota a `shape` se musí shodovat s `rules`.
- Barvy jsou jmenované (`error`, `warning`, `success`, `claude`), ne RGB — viz `docs/vystup-v-tui.md`.
