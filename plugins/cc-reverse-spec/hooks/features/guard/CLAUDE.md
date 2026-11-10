# Slice: guard

## Proč existuje

`legacy/` je jen k čtení (věštba chování) a `generated/` píše generátor.
Agent by je rád „opravil“; řez zápis odmítne a řekne, co udělat místo toho.
Kdyby zmizel, vynucování zůstane jen na slovech ve skillu.

## Co dělá

- `tool.call` pro `Edit`, `Write`, `NotebookEdit` v migračním projektu: cesta pod `legacy/` nebo `generated/` (vůči `$.session.cwd()`) → `{ deny }` s důvodem a radou.
- `decide.ts` — čistá `decide(cwd, path)`: normalizuje absolutní cesty, `./`, `..`, vrací důvod, nebo `null`.
- `.catch` při selhání zápis **zamítne** (fail-closed).

## Kontrakt

- **Čte:** `$.session.cwd()`, `$.fs.stat("spec/rules")`. Nic v `$.state`.
- **Píše:** nic.

## Nepatří sem

| co | kam patří |
|---|---|
| `Bash` (`sed -i legacy/…`, `echo > generated/…`) | nikam — nejde spolehlivě rozebrat shell; hlídá to skill a revize |
| `MultiEdit` | tento build enginu nástroj nezná (matcher by neprošel `tsc`); přidat, až ho typy mají |
| symlinky | nevyhodnocuje se, hlídá se pravopis cesty (best effort) |
| invarianty do promptu | `features/invariants` |

## Pasti

- `legacy-old/` ani `legacy.md` v kořeni nejsou `legacy/` (porovnává se celý první segment).
- Cesta mimo pracovní složku se nehlídá (`null`), stejně jako soubor jménem `legacy` v kořeni.
- Pracovní složka sezení = kořen projektu; sezení spuštěné v podsložce `legacy/` nechrání nic.
