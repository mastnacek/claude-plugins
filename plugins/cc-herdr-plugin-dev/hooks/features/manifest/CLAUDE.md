# Slice: manifest

## Proč existuje

Chybný `herdr-plugin.toml` zjistí člověk až při `herdr plugin link`. Nástroj dá modelu seznam chyb hned po úpravě.

## Co dělá

- `startManifest` (kořen při `session.start`) — `$.tool.register` nástroje **`herdr_validate_manifest`** `{ path }` (soubor nebo složka s manifestem).
- `tool.call {herdr_validate_manifest}` — `shared/actions.validateAt` načte soubor, `shared/manifest.validateManifest` ho zkontroluje,
  `policy.answerText` z výsledku udělá text pro model (chyby, varování).

## Kontrakt

- **Čte:** soubor z `path` přes `$.fs`. **Nepíše** nic.

## Nepatří sem

| co | kam patří |
|---|---|
| pravidla manifestu a čtečka TOML | `shared/manifest`, `shared/toml` (používá je i `command`) |
| kostra pluginu | `scaffold` |

## Pasti

- Pravidla odpovídají herdr 0.9.5 (`references/herdr-plugins.md`); mění-li se manifest herdru, změň `shared/manifest` a jeho test.
- Čtečka TOML umí jen to, co manifest potřebuje (řetězce, čísla, pole, tabulky); inline tabulky a datumy jsou chyba parsování s číslem řádku.
