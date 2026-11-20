# Slice: mask-note

## Proč existuje

Po každém maskování má člověk vidět, že se něco stalo, i když soubor už dřív povolil
a žádný dialog nevznikl. Řez kreslí malý rámeček s počtem, druhy a stylem a (podle `reveal`) hodnotami.

## Co dělá

- `ui.render` na `ToolUse` — pod řádkem nástroje rámeček „🔒 anon: zamaskováno N hodnot (druhy), styl X“; pod ním nalezené hodnoty (nejvýš 6, zbytek „… a N dalších“).
- `ui.render` na `UserMessage` — totéž pod zprávou uživatele pro prompt a jeho `@` soubory (klíč = odeslaný, už zamaskovaný text).

## Kontrakt

- **`$.state`:** čte `notes` (podle `tool_use_id`) a `promptNotes` (podle `textKey`); píše je `shared/notes` z `tool-mask` a `prompt-mask`.
- **Shared:** `findings` (`kindColor`), `notes` (`textKey`).
- Hodnoty jsou jen na obrazovce: žijí v `$.state` a ve `ui.render`, nikdy ve výsledku nástroje, v kontextu modelu ani v přepisu. Tvar hodnot určuje volba `reveal` (`shared/reveal`).

## Nepatří sem

| co | kam patří |
|---|---|
| zjištění hodnot (`anon scan --with-values`), počty z `anon mask` | `shared/anon.ts` |
| zkrácení hodnoty podle druhu | `shared/reveal.ts` |
| souhlas a seznam nálezů před rozhodnutím | `shared/consent.ts`, `features/findings-band` |

## Pasti

- Poznámka k `@` souboru patří ke zprávě, jejíž `prompt.submit` běžel před `prompt.attachment`; příloha bez předchozího promptu poznámku nedostane.
- Rámeček je i pro soubor povolený dřív nebo bez dialogu (`consent: never`, agent, `-p`).
