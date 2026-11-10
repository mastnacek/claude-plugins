# Slice: indicator

## Proč existuje

Člověk má na první pohled vidět, že překlad je zapnutý, že se právě překládá
a kolik zbývá kreditu na OpenRouteru. Řez to připíše na konec řádku s
nápovědou pod promptem. Kdyby zmizel, plugin funguje beze změny, jen bez
odznaku.

## Co dělá

- `ui.render PromptHint` (`register.tsx`) — přidá do `tail` řádku nápovědy (tlumený text, bez barev) `[🇬🇧 49 Kč]`, při kritickém kreditu `[🇬🇧 ⚠ 12 Kč]`, během překladu `[🇬🇧 ⟳ překládám…]`, na Claude modelu jen `[🇬🇧]`; při vypnutém překladu promptů nic.
- `badge.ts` — `buildBadge(config, credit, translating)` vrací text štítku; `balanceLevel`: do 1 USD `critical` (značka ⚠), do 3 USD `low`, jinak `ok` (bez značky); `addToTail` zachová cizí `tail`.
- `startIndicator` — načte kredit (`refreshCredit`).

## Kontrakt

- **Čte:** `config` (přes `getConfig`), `credit`, `translating`.
- **Píše:** přímo nic. Start volá `refreshCredit`, který zapisuje `credit`.
- **Shared:** `config`, `credit`, `types`.
- Žádný jiný řez indikátor nevolá: hlásí se zápisem do `credit` a `translating`.

## Nepatří sem

| co | kam patří |
|---|---|
| kurz USD→Kč, zůstatek, klíč OpenRouter | `shared/credit.ts` |
| příznak „překládám“ | `shared/progress.ts` (`withProgress`) |
| podrobný zůstatek a kurz | `features/settings-command` (`/prompt-translate stats`) |
| cena a model jednoho překladu | `features/settings-command` (`stats`) |
| toast po překladu | nikam — záměrně zrušeno |

## Pasti

- Atomy `credit` a `translating` jsou deklarované znovu i v `shared/credit.ts` a `shared/progress.ts`: klíč, výchozí hodnota a `shape` musí zůstat shodné.
- Kredit se obnovuje po každém překladu (`translate()`), po příkazu `/prompt-translate` a při startu, s 5minutovou cache — ne na časovač. Nový zdroj stavu = nový atom čtený tady, ne volání odjinud.
