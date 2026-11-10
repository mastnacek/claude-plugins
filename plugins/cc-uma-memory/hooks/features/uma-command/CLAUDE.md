# Slice: uma-command

## Proč existuje

`/uma` je jeden příkaz s podpříkazy, které patří různým řezům. Tenhle řez drží
jeho obal (registraci, nápovědu, doplňování, kreslení výstupu) a dva trvalé
přepínače, které čtou jiné řezy. Bez něj by každý řez registroval vlastní příkaz
a přepínače by neměly kde žít.

## Co dělá

- `startUmaCommand` (`register.tsx`) — zaregistruje `/uma` a načte `settings` ze `$.store` do atomu.
- `command.run {uma}` — `recall [on|off]`, `write-gate [ask|off]`, `help`. Cizí podpříkaz (`claude-memory`) pošle dolů (`next`); neodpoví-li nikdo, řekne „Neznámý podpříkaz“. Modelu jde jen první řádek výstupu, víceřádkový (nápověda) jde do `commandOutputs`.
- `ui.render CommandOutput` — nakreslí víceřádkový výstup z `commandOutputs` (i ten, který zapsal `memory-guard`).
- `prompt.autocomplete` — doplňuje podpříkazy a jejich argumenty (včetně `claude-memory`).
- `settings.ts` — čistá logika: výchozí hodnoty, čtení uložené hodnoty, texty `recall` a `write-gate`.

## Kontrakt

- **Čte:** `settings`, `commandOutputs`.
- **Píše:** `settings` (jediný zapisovatel; po každé změně i `$.store` klíč `settings`, při startu načte), `commandOutputs` (nápověda, nejvýš 20 záznamů).
- **Čtou ho:** `recall` (`settings.recall`), `write-gate` (`settings.writeGate`).
- **Uložení:** `$.store` — platí ve všech sezeních a projektech, mimo repozitář uživatele; přepínače jsou osobní volba, ne vlastnost projektu.

## Nepatří sem

| co | kam patří |
|---|---|
| logika `claude-memory` | `memory-guard` |
| vkládání vzpomínek do promptu | `recall` |
| dialog před zápisem, kontrola bashe | `write-gate` |
| štítek pod promptem | `memory-guard` |

## Pasti

- Zapisovatel `settings` je jen tenhle řez. Ostatní čtou; do atomu nepíšou, jinak se rozejde se `$.store`.
- `command.run` nad nebo pod `memory-guard` na pořadí nezáleží: každý řez odpoví na své podpříkazy a ostatní pošle dolů. Neznámý podpříkaz se pozná tak, že `next` nevrátil `text` (nebo selhal).
- Nápověda a doplňování znají argumenty `claude-memory` ručně (cizí řez nesmíme importovat). Změníš-li je v `memory-guard`, změň je tady.
- Do `$.state` se nepíše z `command.run` jiného řezu než vlastníka atomu; atomy se deklarují v každém souboru, který je čte, klíč a výchozí hodnota se musí shodovat (`settings`: `{ recall: true, writeGate: "ask" }`).
- Změní-li se tvar `settings`, ošetři starý tvar ve `parseStored` (uložená hodnota přežije aktualizaci pluginu).
