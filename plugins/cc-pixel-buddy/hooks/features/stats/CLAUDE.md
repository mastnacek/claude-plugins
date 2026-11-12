# stats

Statistiky dne: tahy, chyby nástrojů, úpravy souborů (Edit/Write/NotebookEdit), commity, testy zelené / červené.

## Kontrakt

- Píše: `stats` (`DayStats`, `Shaped` `stats-1`) a zrcadlí ho do `$.store` pod klíčem `stats`.
- Čte: `$.store` při startu (`startStats`). Události dostává od kořene: `statsTurnStart`, `statsCall`.
- Nový den = nový záznam: při každé události se porovná `day` (místní datum) s dneškem.
- Co je v úložišti, čte `parseStored`: jiný den, nesmysl nebo starý tvar → prázdný den; chybějící / špatná
  počítadla → 0, dobrá zůstanou.

## Nepatří sem

| věc | kam |
|---|---|
| zobrazení čísel (pruh, panel, `/buddy`) | `face`, `command` |
| nálada, hlášky | `mood`, `hints` |
| rozpoznání commitu / testu | `shared/classify.ts` |

## Pasti

- Změní-li se tvar `DayStats`, změň `shape` (`stats-1` → `stats-2`) v souborech, které atom deklarují
  (`stats`, `face`, `command`), a zpracuj starý záznam v `parseStored`.
- Chyba nástroje se počítá i u neúspěšného testu (testy červené jsou zároveň chyba).
