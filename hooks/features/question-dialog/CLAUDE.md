# Slice: question-dialog

## Proč existuje

Když model otevře dialog `AskUserQuestion`, napíše ho anglicky. Tenhle řez
otázky, popisky voleb a jejich popisy přeloží do cílového jazyka dřív, než se
dialog nakreslí. Kdyby řez zmizel, dialogy zůstanou anglicky, nic jiného se
nerozbije.

## Co dělá

- `tool.call {AskUserQuestion}` (`register.ts`) — přeloží `question`, `label` a `description` všech voleb jedním požadavkem jako bloky `<<<n>>>`; `header` (krátké štítky) zůstává.
- `blocks.ts` — `collectQuestionFields` (hluboká kopie + seznam polí), `formatBlocks`, `parseBlocks`, `labelsDistinct`.
- Cokoli selže (`degraded`, porušený formát značek, kolize popisků, výjimka) → dialog zůstane tak, jak ho model napsal.
- Přeskočí dialog, ve kterém už žádný text není anglicky (`detectLanguageOrCode`).

## Kontrakt

- **`$.state`:** řez nemá žádný vlastní atom, nic přímo nečte ani nepíše.
- **Čte:** `config` (`enabled`, `translateToolUi`, `targetLanguage`).
- **Nepřímo přes `translate()` a `withProgress`:** `translating`, `sessionCostUsd`, `telemetry`, `credit`.
- **Shared:** `config`, `log`, `progress`, `translation/translate`, `translation/detect`.

## Nepatří sem

| co | kam patří |
|---|---|
| samotný překlad a jeho selhání (`degraded`) | `shared/translation/translate.ts` |
| ano/ne otázka před odesláním překladu promptu | `features/prompt-to-english/ask.ts` |
| přepínač `ui on\|off` | `features/settings-command` |
| překlad `header` štítků | nikam — záměrně zůstávají jak je model napsal |

## Pasti

- `parseBlocks` je přísný: značka a text na jednom řádku (`<<<0>>> A`) vrátí `null` a dialog zůstane anglicky.
- Výstup obalený do ``` nechá zbytečný ``` na konci posledního bloku a dvě stejné značky za sebou tiše přepíšou první text — ověřeno, v kódu neošetřeno.
- Úpravy se dělají na kopii (`copy`); do `next` jde až po všech kontrolách, původní `questions` se nemění.
