# Slice: reply-unmask

## Proč existuje

Odpověď asistenta obsahuje falešné hodnoty. Volitelně je na obrazovce nahradí
originály; model i uložená zpráva zůstávají beze změny.

## Co dělá

- Je-li `userConfig.unmaskReply` zapnuté (výchozí vypnuto), `ui.render` na `AssistantMessage` nakreslí text přes `anon unmask`. Selže-li, nakreslí se původní odpověď.

## Kontrakt

- **`$.state`:** nic. **Čte:** `options.unmaskReply`. **Shared:** `anon` (`unmask`).

## Nepatří sem

| co | kam patří |
|---|---|
| maskování cokoli | `features/prompt-mask`, `features/tool-mask` |

## Pasti

- Změna přepínače se projeví po reloadu modulu (`register` čte `options` jednou).
- Jen vzhled: tool-uses a jejich výsledky v přepisu zůstávají maskované.
