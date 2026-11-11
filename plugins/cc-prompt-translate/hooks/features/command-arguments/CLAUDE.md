# Slice: command-arguments

## Proč existuje

Skill nebo slash příkaz s argumenty psanými česky (`/něco udělej to a to`)
by model dostal česky. Tenhle řez volný text v argumentech přeloží do
angličtiny; samotné `/jméno` zůstává. Kdyby řez zmizel, argumenty půjdou
nepřeložené, nic jiného se nerozbije.

## Co dělá

- `command.run` bez matcheru (`register.ts`) — přeloží `e.args` do angličtiny a pustí příkaz dál s novými argumenty.
- Jen příkazy se zdrojem `plugin` nebo `user` (zjišťuje se z `$.command.list()`); argumenty vestavěných příkazů nejsou próza.
- Jen vstup z `composer`/`bridge`.
- Přeskočí prázdné argumenty, angličtinu a kód (`detectLanguageOrCode`) a vlastní příkaz `prompt-translate`.
- Překládá jen argumenty, které jsou próza (`argsAreProse` v `pending.ts`): vlastní příkazy a skilly uživatele (`user`) a skilly/příkazy z manifestu pluginu, které mají jmenný prostor `plugin:jméno`. Příkaz registrovaný z kódu pluginu (`/tts`, `/spec-check`, bez dvojtečky) čte přesné podpříkazy — přeložené `help` se vrátilo jako „Help.“ a `/tts` ho nepoznal.
- Při `degraded` argumenty zůstanou původní.
- Nastaví `pending` (`pending.ts`, čistá `pendingFor`) pro příkazy ze zdroje `plugin`/`user` z `composer`/`bridge`, při zapnutém pluginu, mimo `prompt-translate` — **i s prázdnými argumenty**; `prompt-to-english` totiž prompt začínající `/` přeskočí, takže bez toho by se odpověď na skill nepřeložila. Vestavěné příkazy `pending` nenastavují.

## Kontrakt

- **`$.state`:** píše `pending` (atom deklarovaný v `register.ts`, stejný klíč/výchozí hodnota jako jinde); jiný vlastní atom nemá.
- **Čte:** `config` (přes `getConfig`). **Píše:** `pending`.
- **Nepřímo přes `withProgress`/`translate()`:** `translating`, `sessionCostUsd`, `telemetry`, `credit`.
- **Shared:** `types`, `config`, `progress`, `translation/translate`, `translation/detect`.

## Nepatří sem

| co | kam patří |
|---|---|
| překlad celého promptu | `features/prompt-to-english` |
| podpříkazy `/prompt-translate …` | `features/settings-command` |
| argumenty vestavěných příkazů | nikam — nejsou to próza, záměrně se nepřekládají |
| argumenty příkazů z kódu pluginů (`/tts help`) | nikam — jsou to přesné hodnoty, záměrně se nepřekládají |
| toast „/příkaz argumenty → EN“ | nikam — záměrně zrušeno |

## Pasti

- `$.command.list()` nevrací schéma argumentů (`argumentHint` jiných pluginů není vidět): jediný signál je tvar jména. Uvnitř textu skillu klíčové slovo od prózy rozeznat nejde; doslovné hodnoty chrání backticky (`protect.ts`).

- `OWN_COMMAND = "prompt-translate"` (v `pending.ts`) je tu opsaný, řez nesmí importovat `COMMAND` ze `settings-command`. Přejmenování příkazu se musí udělat na obou místech.
- Engine pustí `command.run` bez matcheru jen jednou na plugin. Tenhle hook je jediný takový; `settings-command` používá matcher `{ command }`.
