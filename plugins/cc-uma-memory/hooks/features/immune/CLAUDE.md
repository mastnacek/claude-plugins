# Slice: immune

## Proč existuje

Model upravuje kód, aniž by věděl, že sahá do bolavého souboru nebo proti
pravidlu, které si uživatel zapsal do paměti. Řez před `Write` / `Edit` /
`NotebookEdit` soubor posoudí a uživatele upozorní, nebo se zeptá (port
imunitního interceptoru z pi, `slices/immune` + `hooks/immune_interceptor.ts`).
Kdyby zmizel, pravidla a bolest souborů by model viděl jen v textu system promptu.

## Co dělá

- `tool.call` s matcherem `Write`, `Edit`, `NotebookEdit` (`register.ts`; tři hooky na jedno tělo `guard`). Cesta v úložišti UMA se přeskočí (hlídá ji `write-gate`). Jinak:
  1. `uma risk pain <path> --json` a čtyři `uma list --json --type decision|pattern|preference|correction` (cwd sezení, timeout 5 s; pravidla se drží 10 minut na cwd).
  2. `assessEdit` (`policy.ts`, prahy a metrika doslova z pi) + kontrakty ast-grep (`contracts.ts` čistá část; proces v `register.ts`).
  3. `decideAction` podle `settings.immune`:
     **off** nic · **warn** (výchozí) jeden řádek `$.ui.log`, modelu nic · **ask** dialog `$.ui.ask` (`🛡️ UMA imunitní interceptor`, `Ano, pokračovat` / `Ne, zablokovat`); Ne = `{ deny }` s varováním · **auto** ověřený `deny` kontrakt zablokuje hned (řádek logu + důvod modelu), zbytek se ptá.
  4. Dialog jen když jde o pravidlo, kontrakt nebo bolest ≥ 50; jinak varování dostane model jako `context` k výsledku nástroje (v pi `tool_result`). Po „Ano“ dostane model varování a doporučení také.
- Doporučení (`recommendation.ts` čistá část, otázka přes `shared/openrouter`): má-li úprava shodu s pravidlem, zeptá se OpenRouter (výchozí `google/gemini-3.5-flash-lite`, jiný model `settings.immuneModel`) VIOLATE / TOUCH / UNRELATED a přidá řádek `🧠 Jev: …` do dialogu. Timeout 8 s, chyba, nečitelná odpověď, chybějící klíč → dialog bez něj. Nikdy samo neschválí ani nezablokuje.
- Rozhodnutí (`log.ts`): po odpovědi v dialogu záznam `{ts, ruleId, relation, confidence, approved}` do `$.store` (klíč `immuneLog`, nejvýš 500, ne do faktů) a plasticita pravidla jako v pi: Ne → `uma plasticity reinforce <id>`, Ano proti verdiktu „violates“ → `frustrate`; dotek a nesouvisí nic nemění.
- `command.run {uma}` — jen `immune stats` (shrnutí z logu). Přepínače `immune` a `immune-model` zapisuje `uma-command`.

## Kontrakt

- **Čte:** `settings` (`immune`, `immuneModel`).
- **Píše:** `$.store` klíč `immuneLog` (jediný zapisovatel); do `$.state` jen `commandOutputs` (data `/uma immune stats` z `statsOut`, kreslí `uma-command`).
- **Procesy:** `uma risk pain`, `uma list --json --type …`, `uma plasticity …`, `ast-grep scan` (z `PATH`, jinak kopie z `~/.pi/agent/npm/node_modules/@ast-grep/…`).
- **Síť:** jen `shared/openrouter` (`$.http.fetch`); klíč `OPENROUTER_API_KEY` nebo `~/.pi/agent/auth.json`, nikdy se nelogují ani nevypisují.

## Nepatří sem

| co | kam patří |
|---|---|
| přepínače `/uma immune`, `/uma immune-model` | `uma-command` |
| zákaz zápisu do úložiště, dialog pro mutující bash | `write-gate` |
| volání modelu Claude (`$.model.complete`) | nepoužívat — rozhodnutí uživatele: doporučení jen přes OpenRouter |

## Pasti

- **Invariant pi: heuristika nikdy tiše nevetuje.** Veto bez dialogu smí dát jen ověřený `deny` kontrakt v režimu `auto`. Bez možnosti zeptat se (`-p`, zavřený dialog) úprava projde s varováním a řádkem logu — jinak by `ask` v `-p` zablokoval každou práci.
- **Pi `auto` je „blokuje kontrakt“, ne „ptá se“** — port drží pi (zadání říká „dialog“; rozdíl je jen u ověřeného kontraktu, a ten není tichý: řádek logu + důvod modelu).
- **ast-grep přes stdin:** `scan --stdin --inline-rules <yaml> --json=compact`, přidaný text na stdin (pi psal dočasné soubory). Exit 1 s nálezy je úspěšný scan. Víceřádkový vzor, neznámý jazyk, „slepé“ vzory (`::$$$X`, metaproměnná v řetězci) a chybějící binárka se **viditelně** sníží na varování; `deny` kontrakt tak nikdy neprojde ani neblokuje bez ověření. Nelze otestovat proti skutečnému ast-grep (testy jen s mocky; ručně ověřeno 0.51 z npm kopie pi).
- Jen nové soubory: `uma risk pain` selže (soubor neexistuje) → bez bolesti, pravidla se posuzují dál.
- `uma` má v `argv[0]` jméno z `PATH`; chybí-li, vše tiše odpadne a úprava projde.
- Hook `tool.call` má rozpočet 10 s vlastního času, který stojí během volání `$` (dialog, HTTP, procesy) — proto je dialog i doporučení uvnitř hooku bezpečné.
- `shared/openrouter.complete` vrací `{ ok:false, reason }` s důvodem `no-key`/`timeout`/`HTTP n`/`empty`/`error`; důvod nikdy neobsahuje tělo odpovědi ani hlavičky.
- Cache pravidel a cesty k ast-grep je proměnná modulu (reload ji nuluje); `resetImmuneCache()` pro testy.
- Pořadí v kořeni: `registerImmune` po `registerWriteGate`. NotebookEdit se bere jako `new_source` buňky (smazání buňky se nesoudí).
- `/uma immune block` z pi zde neexistuje (alias `auto`).
