# Slice: memory-guard

## Proč existuje

UMA má být jediná paměť; automatická paměť Claude Code (`autoMemoryEnabled`) s ní
soupeří. Řez ji umí vypnout a zapnout (globálně nebo pro projekt) a její stav
drží pod promptem. Kdyby zmizel, UMA běží dál, jen se paměť Claude přepíná ručně
v nastavení.

## Co dělá

- `startMemoryGuard` (`register.tsx`) — zaregistruje `/uma`, nakreslí stav přes `$.ui.status`.
- `command.run {uma}` — `claude-memory [on|off] [--global]`, `help`; modelu vrátí jen první řádek výstupu.
- `ui.render CommandOutput` — nakreslí celý víceřádkový výstup z `commandOutputs`.
- `prompt.autocomplete` — doplňuje `claude-memory`, `help`, `on`, `off`, `--global`.
- `settings.ts` — čistá logika: `effectiveState` (global < projekt < lokální < výchozí = zapnuto) a `setAutoMemory` (mění jen jeden klíč, nevalidní JSON nepřepíše).

Zdroj `/uma` je zatím tady; až přibudou další podpříkazy, vyčlení se do vlastního řezu.

## Kontrakt

- **Čte:** `commandOutputs`, `memoryChanged`.
- **Píše:** `commandOutputs` (nejvýš 20 záznamů), `memoryChanged` (po první změně v sezení).
- **Soubory:** jen přes `$.fs`: `~/.claude/settings.json`, `<cwd>/.claude/settings.json` (jen čte), `<cwd>/.claude/settings.local.json`.

## Nepatří sem

| co | kam patří |
|---|---|
| jiné podpříkazy `/uma` | vlastní řez, příkaz se vyčlení |
| samotná paměť UMA | jiný řez |
| `$.http.fetch` | `shared/` |

## Pasti

- Systémový prompt se staví při startu, proto změna platí od příštího sezení; status to říká (`memoryChanged`).
- Text pluginového příkazu jde do požadavků modelu, proto dostane jen první řádek; dva výstupy se stejnou první řádkou se v `commandOutputs` přepíšou.
- `commandOutputsAtom` a `memoryChangedAtom` se deklarují v každém souboru, který je čte; klíč a výchozí hodnota se musí shodovat.
- Nevalidní JSON v cílovém souboru = nic se nezapíše; ve čtených vrstvách se bere jako nedefinováno.
