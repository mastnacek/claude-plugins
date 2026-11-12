# Slice: line-limit

## Proč existuje

Soubory, které rostou bez dozoru, se v herdr pluginech (VSA) nedají udržet. Řez nutí model rozdělit soubor, jakmile překročí 400 řádků.

## Co dělá

- `tool.call {Edit, Write, MultiEdit}`: `await next(e)`, pak spočítá řádky souboru (`$.fs.read`, `project.countLines`):
  - nad 400 → `{ deny }` po proběhlé úpravě: model dostane „nástroj proběhl, výsledek zadržen“ + pokyn rozdělit soubor (`limit.notice`);
  - 300–400 → varování jako poznámka (`context`) k výsledku;
  - jinak výsledek beze změny.
- Jen zdrojáky v herdr projektu; `.md`, `.toml`, `.json`, `node_modules`, `target`, `dist`, lock soubory a podobné jsou mimo. Chyba = výsledek zůstane (fail-open).

## Kontrakt

- **Čte:** soubor po úpravě. **Nepíše** nic (ani `$.state`).

## Nepatří sem

| co | kam patří |
|---|---|
| zamítnutí před přečtením dokumentace | `docs-gate` |
| co je herdr projekt / zdroják, počítání řádků | `shared/project` |

## Pasti

- Přepsaný výsledek s `isError` nefunguje: engine ho dál mapuje mapperem nástroje a model čte „File created“ (ověřeno naživo). Použij `{ deny }` po `next`.
- Watchdog zapíše takové zamítnutí jako zamítnuté volání.
- Úprava už proběhla; chyba jen říká modelu, ať soubor rozdělí (nic se nevrací zpět).
- Limity (`MAX_FILE_LINES`, `WARN_FILE_LINES`) jsou ve `shared/project`.
