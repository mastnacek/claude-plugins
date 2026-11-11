# Slice: uma-command

## Proč existuje

`/uma` je jeden příkaz s podpříkazy, které patří různým řezům. Tenhle řez drží
jeho obal (registraci, nápovědu, doplňování, kreslení výstupu) tři trvalé
přepínače, které čtou jiné řezy, a čtecí příkazy pro člověka. Bez něj by každý řez registroval vlastní příkaz
a přepínače by neměly kde žít.

## Co dělá

- `startUmaCommand` (`register.tsx`) — zaregistruje `/uma` a načte `settings` ze `$.store` do atomu.
- `command.run {uma}` — `recall [on|off]`, `write-gate [ask|off]`, `append [on|off]`, `humility [on|off]`, `immune [off|warn|ask|auto]` a `immune-model [<openrouter-id>|default]` (`immune stats` pošle dolů — čte ho `immune`), `search`, `list`, `read`, `timeline`, `doctor`, `reindex`, `export`, `debt [list|clear]`, `help`. Cizí podpříkaz (`claude-memory`) pošle dolů (`next`); neodpoví-li nikdo, řekne „Neznámý podpříkaz“. Modelu jde jen první řádek výstupu, víceřádkový (nápověda) jde do `commandOutputs`.
- `ui.render CommandOutput` — nakreslí víceřádkový výstup z `commandOutputs` (i ten, který zapsal `memory-guard`).
- `prompt.autocomplete` — doplňuje podpříkazy a jejich argumenty (včetně `claude-memory`).
- `settings.ts` — čistá logika: výchozí hodnoty, čtení uložené hodnoty, texty `recall`, `write-gate` a `append`.
- `queries.ts` — čistá logika čtecích příkazů: argv každého podpříkazu, použití při špatných argumentech, tvar výstupu (shrnutí + výpis), hlášky o chybě binárky. Proces spouští `register.tsx` (`$.process.run`, cwd sezení, 30 s).

- `/uma debt` — `list` (výchozí) = `uma debt list --all --json` vykreslený jako shrnutí + řádek na dluh; `clear` = `uma debt clear` přímo přes `$.process.run` (akce člověka, ne bash). Modelu jde jen první řádek.

## Kontrakt

- **Čte:** `settings`, `commandOutputs`.
- **Píše:** `settings` (jediný zapisovatel; po každé změně i `$.store` klíč `settings`, při startu načte), `commandOutputs` (nápověda, nejvýš 20 záznamů).
- **Čtou ho:** `recall` (`settings.recall`), `write-gate` (`settings.writeGate`), `rules` (`settings.append`), `immune` (`settings.immune`, `settings.immuneModel`; prázdný model = výchozí), `humility` (`settings.humility`).
- **Uložení:** `$.store` — platí ve všech sezeních a projektech, mimo repozitář uživatele; přepínače jsou osobní volba, ne vlastnost projektu.

## Nepatří sem

| co | kam patří |
|---|---|
| logika `claude-memory` | `memory-guard` |
| vkládání vzpomínek do promptu | `recall` |
| dialog před zápisem, kontrola bashe | `write-gate` |
| štítek pod promptem | `memory-guard` |
| připomínky dluhů modelu na konci tahu | `debt` |

## Pasti

- Zapisovatel `settings` je jen tenhle řez. Ostatní čtou; do atomu nepíšou, jinak se rozejde se `$.store`.
- `command.run` nad nebo pod `memory-guard` na pořadí nezáleží: každý řez odpoví na své podpříkazy a ostatní pošle dolů. Neznámý podpříkaz se pozná tak, že `next` nevrátil `text` (nebo selhal).
- Nápověda a doplňování znají argumenty `claude-memory` ručně (cizí řez nesmíme importovat). Změníš-li je v `memory-guard`, změň je tady.
- Do `$.state` se nepíše z `command.run` jiného řezu než vlastníka atomu; atomy se deklarují v každém souboru, který je čte, klíč a výchozí hodnota se musí shodovat (`settings`: `{ recall: true, writeGate: "ask", append: true, immune: "warn", immuneModel: "" }`, `shape: "settings-4"`).
- Změní-li se tvar `settings`, ošetři starý tvar ve `parseStored` (uložená hodnota přežije aktualizaci pluginu).
- Čtecí příkazy nic nezapisují do paměti; `reindex` přebuduje jen index, `export` píše jen do složky z `--out`. Argumenty se nepředávají naslepo: `doctor --confirm` by archivoval fakta, `search --vectorize` volá OpenRouter — proto `doctor` nebere žádné přepínače a dotaz/ID jdou za `--`.
- Text výpisu: modelu jde jen shrnutí (první řádek), celý výpis vidí jen člověk (`commandOutputs`, klíč = shrnutí).
- Změníš-li tvar `settings`, zvyš `shape` ve všech šesti souborech, které atom deklarují (`uma-command`, `recall`, `rules`, `write-gate`, `immune`, `humility`), a v `types/index.d.ts` zůstává `Shaped<…>`.
- Výchozí model doporučení (`google/gemini-3.5-flash-lite`) je dvakrát: `settings.ts` (výpis `/uma immune-model`) a `immune/recommendation.ts` (použití). Řezy nesdílejí kód; změníš-li ho, změň oba.
