# Slice: media-guard

## Proč existuje

PDF a obrázky nesou originály, které `anon mask` na bajtech nezamaskuje. Řez je buď převede na maskovaný text, nebo se zeptá.

## Co dělá

- `tool.call` na `Read` souboru `.pdf`: `pdftotext -layout <soubor> -` (volitelně `pages` jako `-f/-l`), text projde `anon mask` a vrátí se jako vlastní `{ result }`; samotný PDF se nikdy nepředá. `pdftotext` chybí nebo selže → `deny`.
- `Read` obrázku (png, jpg, jpeg, gif, bmp, webp, tif, tiff): dialog „Obrázek nejde zamaskovat. Poslat ho modelu?“; souhlas platí pro soubor do konce sezení. Agent (`CC_ROLE`), běh `-p` a `consent: never` → `deny`.
- Složky stavu agentů (`shared/paths`) projdou.

## Kontrakt

- **`$.state`:** píše `notes` přes `shared/notes`.
- **Shared:** `anon` (`convert`), `consent` (`isAsking`, `policyOf`), `notes`, `paths`.

## Nepatří sem

| co | kam patří |
|---|---|
| textové soubory | `features/tool-mask` |
| obrázky vložené do promptu | nelze maskovat; varování kreslí `features/mask-note` |

## Pasti

- Řez odpovídá sám (PDF) nebo po souhlasu volá `next` (obrázek): musí stát před `tool-mask`, který média přeskakuje (`isMedia`), jinak by obrázek šel do `anon scan`. Test celým řetězcem: `hooks/chain.test.ts`.
- Tvar výsledku je jako u textového Read (`file.content`).
