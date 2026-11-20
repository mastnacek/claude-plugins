# Slice: findings-band

## Proč existuje

Souhlas (`shared/consent`) se ptá v barevném panelu. Člověk má na první pohled
vidět, **ve kterém souboru** a **kde** anon něco našel, o jaký druh jde, a jedním
stiskem povolit nebo zamítnout. (Název složky zůstal z doby, kdy to byl pás nad promptem.)

## Co dělá

- `ui.render` na `Pane` (`requestId` = `CONSENT_PANE`) — titulek „anon: citlivé hodnoty“, každý soubor jednou (krátká cesta, tučně), pod ním řádky `řádek:sloupec` (dim), druh barevně (heslo/tajemství červeně, jméno žlutě, e-mail modře, ostatní azurově), pravidlo dim, počet znaků. Dvě tlačítka: **Povolit (Enter)** (`autoFocus`, `primary`) a **Zamítnout (Esc)**. Tlačítka volají `settleConsent`.
- `ui.render` na `ToolUse` — barevná karta pod řádkem nástroje (`tool_use_id` z atomu `cards`, `await next(e)` drží řádek): stejný seznam nálezů jako panel, po rozhodnutí stavový řádek (povoleno + styl / zamítnuto). Funguje při jakékoli šířce terminálu.
- `ui.close` na `CONSENT_PANE` — zavření panelu (Esc, značka zavření) je `settleConsent(false)`, tedy zamítnutí.
- `ui.render` na `AbovePrompt` — už jen varování `redactWarning` (vstup nástroje s nevratným `REDACTED`, píše `tool-mask`); `turn.start` ho maže. Nálezy pás nekreslí.

## Kontrakt

- **`$.state`:** čte `cards` (píše `shared/consent` u volání nástroje), `redactWarning` (píše `tool-mask`, maže tady) a `findings` (píše `shared/consent` před otevřením panelu, po odpovědi maže).
- **Shared:** `consent` (`CONSENT_PANE`, `settleConsent`), `findings` (`kindColor`; seskupení dělá `consent`).
- Atom `findings` je deklarovaný v každém souboru, který ho čte nebo píše (skenování enginu čte odkaz tam, kde se používá).

## Nepatří sem

| co | kam patří |
|---|---|
| spuštění `anon scan`, parsování JSON | `shared/anon.ts` |
| seskupení podle souboru, krátké cesty | `shared/findings.ts` |
| otevření panelu, čekání na odpověď, záložní `$.ui.ask` | `shared/consent.ts` |

## Pasti

- Panel nese jen druh, pozici a délku; hodnoty `anon scan --json` nikdy nevrací a řez je nesmí hledat jinde.
- Panel otevřený z hooku `tool.call` se umístí až od 144 sloupců; proto volání nástroje dostane kartu a při nevykreslení panelu krátký `$.ui.ask` („Citlivé hodnoty jsou vypsané výše. Povolit?“, bez seznamu). Pro `@` zmínky (bez karty) je záloha dialog s prostým seznamem; `findings` se tehdy nenastaví.
- Zavření panelu osobou (`ui.close`, origin `person`) test nespustí (test `$` nemá `ui.close`); v TUI neověřeno.
