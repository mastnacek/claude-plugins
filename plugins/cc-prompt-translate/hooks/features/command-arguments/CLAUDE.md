# Slice: command-arguments

## Proč existuje

Skill nebo slash příkaz s argumenty psanými česky (`/něco udělej to a to`)
by model dostal česky. Tenhle řez volný text v argumentech přeloží do
angličtiny; samotné `/jméno` zůstává. Kdyby řez zmizel, argumenty půjdou
nepřeložené, nic jiného se nerozbije.

## Co dělá

- `command.run` bez matcheru (`register.ts`) — přeloží `e.args` do angličtiny a pustí příkaz dál s novými argumenty.
- Hook `command.describe` (bez matcheru; výsledek nikdy nemění, vždy `next(e)`) ukládá `{ description, argumentHint }` každého příkazu do `commandMeta`.
- `command.run` bez matcheru (`register.ts`) — rozhodne, zda argumenty přeložit, a pustí příkaz dál s novými argumenty. **Nic nezná jménem**: ani plugin, ani příkaz, ani podpříkaz; rozhoduje jen to, co engine o příkazu hlásí.
- Jen příkazy se zdrojem `plugin` nebo `user` (z `$.command.list()`), jen vstup z `composer`/`bridge`.
- **Bez volání modelu** (`metadata.ts`, čisté funkce): z `argumentHint` se vytěží literály — slova oddělená `|` (i uvnitř `[...]`, `<...>`, `{...}`) a holá slova mimo závorky; slova v závorkách jsou zástupné názvy. Z popisu se berou jen alternativy `a|b`. Argumenty se nepřekládají, pokud po odebrání literálů, čísel a kódu/cest/flagů (`--x`, `a/b`, `a_b`, `a.b`, `camelCase`) zbytek nevypadá česky (`detectLanguageOrCode`: diakritika nebo běžná česká slova).
- Jinak `translate(…, "arguments", kontext)`: kontext je jméno příkazu, popis a hint; systémový prompt (`ARGUMENTS_SYSTEM_PROMPT`, bez boostu) překládá jen přirozený jazyk.
- **Kontrola výsledku** (`literalsSurvive`): každý literál z argumentů musí ve výstupu zůstat doslova (case, bez interpunkce, stejný počet); jinak jdou původní argumenty. Při `degraded` také.
- Bez metadat (příkaz se ještě nevypsal): kontext má jen jméno (a popis ze `$.command.list()`), kontrola literálů je prázdná. Žádný hardcoded fallback.
- Nastaví `pending` (`pending.ts`, čistá `pendingFor`) pro příkazy ze zdroje `plugin`/`user` z `composer`/`bridge`, při zapnutém pluginu — **i s prázdnými argumenty**; `prompt-to-english` totiž prompt začínající `/` přeskočí, takže bez toho by se odpověď na skill nepřeložila. Vestavěné příkazy `pending` nenastavují.

## Kontrakt

- **`$.state`:** píše `pending` (stejný klíč/výchozí hodnota jako jinde) a vlastní `commandMeta` (`Record<příkaz, { description, argumentHint? }>`, `shape: "command-meta-1"`, ořezaný na 500); oba atomy deklaruje `register.ts`. Nikdo jiný `commandMeta` nečte ani nepíše.
- **Čte:** `config` (přes `getConfig`), `commandMeta`. **Píše:** `pending`, `commandMeta`.
- **Nepřímo přes `withProgress`/`translate()`:** `translating`, `sessionCostUsd`, `telemetry`, `credit`.
- **Shared:** `types`, `config`, `progress`, `translation/translate`, `translation/detect`.

## Nepatří sem

| co | kam patří |
|---|---|
| překlad celého promptu | `features/prompt-to-english` |
| podpříkazy `/prompt-translate …` | `features/settings-command` |
| argumenty vestavěných příkazů | nikam — nejsou to próza, záměrně se nepřekládají |
| seznam jmen pluginů/příkazů/podpříkazů, pravidlo podle tvaru jména (dvojtečka) | nikam — zakázáno; rozhoduje `argumentHint`/popis z enginu |
| toast „/příkaz argumenty → EN“ | nikam — záměrně zrušeno |

## Pasti

- `$.command.list()` schéma argumentů nevrací; `argumentHint` přináší až `command.describe`, který engine pouští jednou na příkaz při vypsání (cache do `$.ui.invalidate("command.describe")`). Příkaz, který se ještě nevypsal, metadata nemá — překlad pak běží jen se jménem.
- Hint je volný text: `[a|b]` jsou literály, `[co udělat]` zástupný název; `<a|b>` s `|` se bere jako výčet, i když by šlo o zástupné názvy (neškodí, jen se takové slovo smí v argumentech objevit nepřeložené).
- Mez: česká věta psaná bez diakritiky z neznámých slov (nejsou v tabulce `detect.ts`) se nepozná a nepřeloží.
- Engine pustí `command.run` i `command.describe` bez matcheru jen jednou na plugin. Tyhle hooky jsou jediné takové; `settings-command` používá matcher `{ command }`.
- Vlastní `/prompt-translate` jde stejnou cestou: jeho hint vyjmenuje podpříkazy, takže zůstanou nepřeložené (test v `register.test.ts`).
