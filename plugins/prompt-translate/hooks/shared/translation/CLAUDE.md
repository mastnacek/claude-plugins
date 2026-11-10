# Hluboký modul: translation

## Proč existuje

Každý řez potřebuje něco přeložit (prompt, odpověď, dialog, argumenty) a nikdo
z nich nemá řešit jak: který model, který backend, kolik opakování, jak
ochránit kód a cesty. Jedno volání `translate()` to všechno schová. Selhání
nikdy nevyhodí výjimku, ale vrátí původní text s příznakem `degraded`.

## Co dělá (veřejné rozhraní)

- `translate($, text, targetLanguage, purpose, conversationContext?)` v `translate.ts` → `TranslationResult { text, usage, costUsd, costCzk, model, degraded? }`; `purpose` je `"prompt"`, `"answer"` nebo `"tool"`.
- `detectLanguageOrCode(text)` v `detect.ts` → `{ isEnglishOrCode, reason }`.
- Jen tyhle dva soubory jsou vstupy zvenčí.

## Kontrakt

- **Skrývá:** `protect.ts` (maskování a vrácení kódu, cest, URL, tabulek) a `prompts.ts` (systémové prompty podle `boost`) jsou **interní**; mimo složku je nikdo neimportuje (`scripts/vsa-check.sh`, pravidlo 3).
- **Skrývá také:** backendy OpenRouter (`$.http.fetch`) a Claude (`$.model.complete`), opakování, zálohu na `translateModel`, reasoning, limit tokenů, cenu v Kč.
- **Čte:** `config`. **Píše:** `sessionCostUsd`, `telemetry`, `credit` (přes `refreshCredit`). `translating` nezapisuje, to dělá volající přes `withProgress`.
- **Shared:** `config`, `credit`, `log`, `types`.

## Nepatří sem

| co | kam patří |
|---|---|
| kdy překládat (autodetekce, potvrzení, `pending`) | `features/*` |
| rozhodnutí, zda přiložit historii | `features/prompt-to-english/history.ts` |
| kurz, zůstatek a klíč OpenRouter | `shared/credit.ts` |
| příznak „překládám“ | `shared/progress.ts` |
| rámeček, odznak, toast | `features/prompt-to-english`, `features/indicator`; toast nikam — zrušeno |

## Pasti

- `degraded: true` znamená, že `text` je původní nepřeložený text. Volající ho nesmí uložit jako překlad ani dál zpracovávat jako přeložený.
- Selže-li model, nebo se ztratí víc než 3 chráněné segmenty (`stats.appended > 3`), vrátí se původní text; zamaskovaný text nikdy neodejde ven.
- Zástupný token `__PI_PROMPT_TRANSLATE_PROTECTED_n__` je v `protect.ts` i v textech `prompts.ts` a `translate.ts`; změna se musí udělat na všech místech.
- Atomy `sessionCostUsd` a `telemetry` se deklarují i v `settings-command/run.ts`; klíč, výchozí hodnota a `shape` se musí shodovat.
- `$.http.fetch` smí zůstat jen ve `shared/` (`vsa-check.sh`, pravidlo 4).
