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
- Při `degraded` argumenty zůstanou původní.

## Kontrakt

- **`$.state`:** řez nemá žádný vlastní atom.
- **Čte:** `config` (přes `getConfig`).
- **Nepřímo přes `withProgress`/`translate()`:** `translating`, `sessionCostUsd`, `telemetry`, `credit`.
- **Shared:** `config`, `progress`, `translation/translate`, `translation/detect`.

## Nepatří sem

| co | kam patří |
|---|---|
| překlad celého promptu | `features/prompt-to-english` |
| podpříkazy `/prompt-translate …` | `features/settings-command` |
| argumenty vestavěných příkazů | nikam — nejsou to próza, záměrně se nepřekládají |
| toast „/příkaz argumenty → EN“ | nikam — záměrně zrušeno |

## Pasti

- `OWN_COMMAND = "prompt-translate"` je tu opsaný, řez nesmí importovat `COMMAND` ze `settings-command`. Přejmenování příkazu se musí udělat na obou místech.
- Engine pustí `command.run` bez matcheru jen jednou na plugin. Tenhle hook je jediný takový; `settings-command` používá matcher `{ command }`.
