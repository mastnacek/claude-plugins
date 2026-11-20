# Slice: findings-band

## Proč existuje

Dialog souhlasu (`shared/consent`) ukazuje jen prostý text. Člověk má na první pohled
vidět, **ve kterém souboru** a **kde** anon něco našel a o jaký druh jde.

## Co dělá

- `ui.render` na `AbovePrompt` — dokud je dialog otevřený (`findings` v `$.state` není `null`), nakreslí rámeček: každý soubor jednou (krátká cesta, tučně), pod ním řádky `řádek:sloupec` (dim), druh barevně (heslo/tajemství červeně, jméno žlutě, e-mail modře, ostatní azurově), pravidlo dim, počet znaků. Jinak `next(e)`.

## Kontrakt

- **`$.state`:** čte `findings` (píše `shared/consent` před otázkou, po odpovědi maže).
- **Shared:** `findings` (`kindColor`; seskupení dělá `consent`).
- Atom `findings` je deklarovaný v každém souboru, který ho čte nebo píše (skenování enginu čte odkaz tam, kde se používá).

## Nepatří sem

| co | kam patří |
|---|---|
| spuštění `anon scan`, parsování JSON | `shared/anon.ts` |
| seskupení podle souboru, krátké cesty | `shared/findings.ts` |
| dotaz „Povolit?“ | `shared/consent.ts` |

## Pasti

- Pás nese jen druh, pozici a délku; hodnoty `anon scan --json` nikdy nevrací a řez je nesmí hledat jinde.
- Zda pás zůstane viditelný nad otevřeným dialogem, jsem v živém TUI neověřil; otázka dialogu proto obsahuje stejný seznam prostým textem.
