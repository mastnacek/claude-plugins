# Slice: uma-command

## Proč existuje

`/uma` je jeden příkaz s podpříkazy, které patří různým řezům. Tenhle řez drží
jeho obal (registraci, nápovědu, doplňování, kreslení výstupu) tři trvalé
přepínače, které čtou jiné řezy, a čtecí příkazy pro člověka. Bez něj by každý řez registroval vlastní příkaz
a přepínače by neměly kde žít.

## Co dělá

- `startUmaCommand` (`register.tsx`) — zaregistruje `/uma` a načte `settings` ze `$.store` do atomu.
- `command.run {uma}` — `recall [on|off]`, `write-gate [ask|off]`, `append [on|off]`, `humility [on|off]`, `shadow [on|off|jev]`, `lang [cs|en]`, `immune [off|warn|ask|auto]` a `immune-model [<openrouter-id>|default]` (`immune stats` pošle dolů — čte ho `immune`), `search`, `list`, `read`, `timeline`, `doctor`, `reindex`, `export`, `debt [list|clear]`, `help`. Cizí podpříkaz (`claude-memory`) pošle dolů (`next`); neodpoví-li nikdo, řekne „Neznámý podpříkaz“. Modelu jde jen první řádek výstupu; co vidí člověk, jde jako **data** do `commandOutputs`.
- `translate.ts` — **překlad jen pro zobrazení** u `search`, `list`, `read`, `timeline` (`Plan.prose`): tituly faktů (u `read` i tělo) se jednou otázkou (`shared/translate`) přeloží do dat rámečku, pod ně přijde dim řádek „🌐 překlad, uloží se anglický originál“; selhání = originál a dim řádek „⚠ překlad nedostupný (důvod)“. Řádek pro model (`text`) a volání motoru se nemění. `settings.lang` `en` = žádné volání.
- `ui.render CommandOutput` — jediný kreslič výstupů `/uma` (`drawOutput`; i těch, které zapsaly `memory-guard`, `staging`, `immune`): rámeček `round` v barvě tónu (`normal` = `claude`, `error`, `warning`, `success`), hlavička `🧠 UMA · titulek` tučně, pak `fields` (štítek → hodnota), `items` (číslovaná položka: barevný štítek typu `📋`, `📁` rozsah, `⚖` skóre, odznak, `🆔` ID, `🏷️` tagy dim, řádky detailu) a `lines`. Bez dat (nic uloženo, starý tvar) `next(e)` — engine nakreslí holý text, nikdy prázdný rámeček. Chyba `❌` v rámečku `error`, použití `⚠️` v `warning`.
- `classify.ts` — čistá `classify(text)`: význam řádku/hodnoty (chyba, varování, úspěch, ID, cesta, číslo, příkaz, prázdný výsledek; CZ i EN klíčová slova) → `styleOf` → barva z `ThemeKey`. Kreslič ji použije jen pro text, který nemá `tone` z dat (stav, závažnost, úroveň kontroly). Barvy typů faktů (`typeColor`): task `planMode`, decision `permission`, pattern `remember`, rule `merged`, preference `suggestion`, correction `autoAccept`, skill `ide`, ostatní `subtle`.
- `output.ts` — čisté převody `--json` motoru na data: `searchOutput`, `listOutput`, `readOutput`, `timelineOutput`, `doctorOutput`, `debtOutput`, `helpOutput`, věty `sentence`/`failure`/`usage`. Nečitelné JSON → řádky motoru jako volný text (`raw`).
- `prompt.autocomplete` — doplňuje podpříkazy a jejich argumenty (včetně `claude-memory`).
- `settings.ts` — čistá logika: výchozí hodnoty, čtení uložené hodnoty, texty `recall`, `write-gate` a `append`.
- `queries.ts` — čistá logika čtecích příkazů: argv každého podpříkazu, použití při špatných argumentech, tvar výstupu (shrnutí + výpis), hlášky o chybě binárky. Proces spouští `register.tsx` (`$.process.run`, cwd sezení, 30 s).

- `/uma debt` — `list` (výchozí) = `uma debt list --all --json` vykreslený jako shrnutí + řádek na dluh; `clear` = `uma debt clear` přímo přes `$.process.run` (akce člověka, ne bash). Modelu jde jen první řádek.

## Kontrakt

- **Čte:** `settings`, `commandOutputs`.
- **Píše:** `settings` (jediný zapisovatel; po každé změně i `$.store` klíč `settings`, při startu načte), `commandOutputs` (čtecí příkazy, nápověda, chyby a použití; nejvýš 20 záznamů).
- **Čtou ho:** `shadow` a `muscle-synthesis` (`settings.shadow`), `recall` (`settings.recall`), `write-gate` (`settings.writeGate`, `lang`), `staging` a `immune` (`settings.lang`), `rules` (`settings.append`), `immune` (`settings.immune`, `settings.immuneModel`; prázdný model = výchozí), `humility` (`settings.humility`).
- **Uložení:** `$.store` — platí ve všech sezeních a projektech, mimo repozitář uživatele; přepínače jsou osobní volba, ne vlastnost projektu.

## Nepatří sem

| co | kam patří |
|---|---|
| logika `claude-memory` | `memory-guard` |
| vkládání vzpomínek do promptu | `recall` |
| dialog před zápisem, kontrola bashe | `write-gate` |
| štítek pod promptem | `memory-guard` |
| připomínky dluhů modelu na konci tahu | `debt` |
| `/uma review`, `/uma staging …` | `staging` (nápověda a doplňování jsou tady a zrcadlí ho ručně) |
| sběr konceptů | `shadow`, `muscle-synthesis` |

## Pasti

- `lang` je poslední pole `settings`; starý uložený tvar bez `lang` se čte jako `cs` (`parseStored`). Zapisovatel `settings` je jen tenhle řez. Ostatní čtou; do atomu nepíšou, jinak se rozejde se `$.store`.
- `command.run` nad nebo pod `memory-guard` na pořadí nezáleží: každý řez odpoví na své podpříkazy a ostatní pošle dolů. Neznámý podpříkaz se pozná tak, že `next` nevrátil `text` (nebo selhal).
- Nápověda a doplňování znají argumenty `claude-memory` ručně (cizí řez nesmíme importovat). Změníš-li je v `memory-guard`, změň je tady.
- Do `$.state` se nepíše z `command.run` jiného řezu než vlastníka atomu; atomy se deklarují v každém souboru, který je čte, klíč a výchozí hodnota se musí shodovat (`settings`: `{ recall: true, writeGate: "ask", append: true, immune: "warn", immuneModel: "" }`, `shape: "settings-6"`, `lang: "cs"`).
- Změní-li se tvar `settings`, ošetři starý tvar ve `parseStored` (uložená hodnota přežije aktualizaci pluginu).
- Čtecí příkazy nic nezapisují do paměti; `reindex` přebuduje jen index, `export` píše jen do složky z `--out`. Argumenty se nepředávají naslepo: `doctor --confirm` by archivoval fakta, `search --vectorize` volá OpenRouter — proto `doctor` nebere žádné přepínače a dotaz/ID jdou za `--`.
- Tvar `commandOutputs`: `{ [první řádek pro model]: { title, tone, fields?, items?, lines? } }` (`types/index.d.ts`, `Shaped`, `shape: "output-2"` ve čtyřech souborech, které atom deklarují: `uma-command`, `memory-guard`, `staging`, `immune`). Starý tvar (holý text) engine přečte jako `{}`, kreslič navíc ignoruje hodnotu, která není objekt. Řezy kreslič neimportují — píšou jen data v tomhle tvaru; změníš-li ho, změň `types/index.d.ts` a všechny čtyři.
- Čtecí příkazy volají motor s `--json` (`search`, `list`, `read`, `timeline`, `doctor`, `debt list`); text pro model je shrnutí s počtem (`Hledání „x“: 2 výsledky (výpis ukázán uživateli)`) — dřív to byl počet řádků textového výpisu, ten už neexistuje. `reindex`, `export` a `debt clear` JSON nemají: je to jedna věta v rámečku `success`.
- Fakta ve worktree se hledají podle názvu složky repozitáře (rozsah `project:<název>`), ne podle větve.
- Změníš-li tvar `settings`, zvyš `shape` ve všech devíti souborech, které atom deklarují (`uma-command`, `recall`, `rules`, `write-gate`, `immune`, `humility`, `shadow`, `muscle-synthesis`, `staging`), a v `types/index.d.ts` zůstává `Shaped<…>`.
- Výchozí model doporučení (`google/gemini-3.5-flash-lite`) je dvakrát: `settings.ts` (výpis `/uma immune-model`) a `immune/recommendation.ts` (použití). Řezy nesdílejí kód; změníš-li ho, změň oba.
