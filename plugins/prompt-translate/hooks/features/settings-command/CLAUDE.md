# Slice: settings-command

## Proč existuje

Nastavení pluginu (model, boost, historie, přepínače, zůstatek, statistiky) se
mění jedním příkazem `/prompt-translate` přímo z promptu. Řez příkaz
zaregistruje, provede a vykreslí jeho víceřádkový výstup. Kdyby zmizel, plugin
jede s uloženou konfigurací, jen ji nejde měnit zevnitř.

## Co dělá

- `startSettingsCommand` (`register.tsx`) — zaregistruje `/prompt-translate`.
- `command.run {prompt-translate}` — provede řádek (`runCommand` v `run.ts`), obnoví kredit; modelu vrátí jen první řádek výstupu.
- `ui.render CommandOutput` — nakreslí celý víceřádkový výstup z `commandOutputs`.
- `prompt.autocomplete` — doplňuje podpříkazy a hodnoty (`completions`).
- `run.ts` — přepínače, `lang`, `model`, `boost`, `think`, `history` (+ `inspect`), `stats`, `global`, `reset`; ukládá do `.claude/prompt-translate.json` nebo s `--global` pro všechny projekty.
- `texts.ts` — text nápovědy (`help`: příkazy a aktuální nastavení), statistik (`stats`: cena, kredit, kurz, tokeny; u modelu Claude jen tokeny) a krátké popisky modelů.

## Kontrakt

- **Čte:** `config`, `sessionCostUsd`, `telemetry`, `commandOutputs`.
- **Píše:** `config` (`setConfig` + `saveConfig` na disk), `pending` (nuluje při vypnutí, mění `translateResponses`), `commandOutputs` (nejvýš 20 záznamů).
- **Shared:** `config`, `credit`, `recent-context`, `state`, `types`.

## Nepatří sem

| co | kam patří |
|---|---|
| načtení a normalizace konfigurace | `shared/config.ts` |
| zápis ceny a telemetrie | `shared/translation/translate.ts` |
| překlad argumentů jiných příkazů | `features/command-arguments` |
| odznak s kreditem | `features/indicator` |
| výpis přes `$.ui.log` | nikam — log řádek je jednořádkový a `\n` kreslí jako „�“ |

## Pasti

- Text pluginového příkazu jde do požadavků modelu, proto dostane jen první řádek; plný text je v `commandOutputs` pod klíčem „první řádek“. Dva výstupy se stejnou první řádkou se přepíšou.
- `CommandOutput` hledá klíč přes `text === k || text.endsWith(": " + k)`, protože řádek může mít před textem jméno pluginu.
- `COMMAND` je zdroj pravdy; `command-arguments` má vlastní opis, při přejmenování upravit oba.
- `pendingAtom`, `sessionCostAtom` a `telemetryAtom` se deklarují znovu i v jiných souborech; klíč, výchozí hodnota a `shape` se musí shodovat.
