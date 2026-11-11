# Slice: status

## Proč existuje

Stav spec je vidět na první pohled: `spec ✔3 ~2 ?1 · 4 untested` pod
promptem. Kdyby zmizel, čísla by byla jen v `/spec-check`.

## Co dělá

- `session.start` (volá kořen) a po každém `tool.call` nástrojů `Edit`/`Write`/`NotebookEdit`, který zapsal pod `spec/` nebo `tests/features/`: přepočítá a `$.ui.status(...)`.
- `count.ts` — `countSpec` (confidence z `confidence:`, pravidlo „bez testu“ = žádný `@<ID>` ve `.feature`), `statusText`, `affectsStatus`.
- Mimo migrační projekt nic nevypisuje.

## Kontrakt

- **Čte:** soubory `spec/rules/`, `tests/features/`. Nic v `$.state`.
- **Píše:** jen stavový řádek.

## Nepatří sem

| co | kam patří |
|---|---|
| kontrola úplnosti pravidel, `confidence.md` | `features/drift` |
| přepočet po každém volání nástroje | nikam — disk se čte jen po zápisu pod `spec/`, `tests/features/` |

## Pasti

- **Proč bez `$.state`:** drift by po `check` zapsal počty a status je četl, ale status musí počítat už při startu a po ručních úpravách, kdy `check` neběžel; stejně by tedy měl vlastní počítání. Zduplikované minimum (~40 řádků regexů v `count.ts`) je jednodušší než kontrakt s `shape` a pořadím zápisu.
- Počítání je záměrně hrubší než `check` (regexy, ne `parseRule`): neplatná `confidence` se nepočítá nikam.
- Chyba při počítání se spolkne — stavový řádek nestojí za pád tool callu.
- Zápis přes `Bash` (a smazání souboru) status nepřepočítá; obnoví ho další zápis nebo `session.start`.
- `relative.ts` je opis z `guard` (včetně windowsových cest: `\`, písmeno disku bez ohledu na velikost); měnit společně.
- `startStatus` chybu zaloguje jedním řádkem (`$.ui.log`) místo spolknutí; po zápisu nástroje se chyba mlčky spolkne.
