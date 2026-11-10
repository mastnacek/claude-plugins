# Slice: memory-guard

## Proč existuje

UMA má být jediná paměť; automatická paměť Claude Code (`autoMemoryEnabled`) s ní
soupeří. Řez ji umí vypnout a zapnout (globálně nebo pro projekt) její stav
drží pod promptem jako krátký štítek. Kdyby zmizel, UMA běží dál, jen se paměť Claude přepíná ručně
v nastavení.

## Co dělá

- `startMemoryGuard` (`register.tsx`) — jednou smaže řádek z verze 0.1.0 (`$.ui.status(undefined)`) a spočítá `memoryState`.
- `command.run {uma}` — odpovídá jen na `claude-memory [on|off] [--global]`, ostatní podpříkazy pošle dolů (`next`); modelu vrátí jen první řádek výstupu.
- `ui.render PromptHint` — štítek přes pole `tail` props `PromptHint` (engine ho kreslí tlumeně na konci řádku, nezalomí ho; vlastní `<Box>` by ho zalomil): `[UMA]` (paměť Claude vypnutá), `[UMA ⚠ CC]` (zapnutá), před `]` ` ↻` po změně v sezení. Cizí `tail` zachová. Bez barev, jen čte atomy.
- `badge.ts` — čisté funkce `buildBadge(enabled, changed)` → text a `addToTail`.
- `settings.ts` — čistá logika: `effectiveState` (global < projekt < lokální < výchozí = zapnuto) a `setAutoMemory` (mění jen jeden klíč, nevalidní JSON nepřepíše).

Příkaz `/uma` (registrace, nápověda, kreslení víceřádkového výstupu, doplňování) patří řezu `uma-command`; tady je jen logika podpříkazu `claude-memory`.

## Kontrakt

- **Čte:** `commandOutputs`, `memoryState`, `memoryChanged`.
- **Píše:** `commandOutputs` (nejvýš 20 záznamů; kreslí je `uma-command`), `memoryState` (při startu a po každé změně příkazem), `memoryChanged` (po první změně v sezení).
- **Soubory:** jen přes `$.fs`: `~/.claude/settings.json`, `<cwd>/.claude/settings.json` (jen čte), `<cwd>/.claude/settings.local.json`.

## Nepatří sem

| co | kam patří |
|---|---|
| registrace `/uma`, nápověda, doplňování, kreslení výstupu | `uma-command` |
| jiné podpříkazy `/uma` (`recall`, `write-gate`) | `uma-command` (přepínač) a řez, který ho čte |
| samotná paměť UMA | jiný řez |
| `$.ui.status` (štítek je `PromptHint`) | — |
| `$.http.fetch` | `shared/` |

## Pasti

- Systémový prompt se staví při startu, proto změna platí od příštího sezení; štítek to říká ` ↻` (`memoryChanged`).
- Text pluginového příkazu jde do požadavků modelu, proto dostane jen první řádek; dva výstupy se stejnou první řádkou se v `commandOutputs` přepíšou.
- Řádek nápovědy a doplňování pro `claude-memory` žijí v `uma-command` — změníš-li argumenty, změň je tam taky.
- Atomy (`commandOutputs`, `memoryState`, `memoryChanged`) se deklarují v každém souboru, který je čte; klíč a výchozí hodnota se musí shodovat.
- Nevalidní JSON v cílovém souboru = nic se nezapíše; ve čtených vrstvách se bere jako nedefinováno.
