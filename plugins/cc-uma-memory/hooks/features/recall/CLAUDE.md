# Slice: recall

## Proč existuje

Model si sám od sebe nevzpomene, že UMA něco ví. Řez před každým promptem zeptá
UMA (`uma recall check`) a pasáže, které se k úkolu hodí, přidá k promptu jako
skrytý kontext. Kdyby zmizel, paměť zůstane dostupná jen přes nástroje MCP.

## Co dělá

- `prompt.submit` (`register.ts`) — není-li prompt příkaz (`/…`, `e.command`, `e.isMeta`), pochází-li od uživatele a je-li `settings.recall` zapnuto, spustí `uma recall check --judge jev --max 3 --json [--exclude ID]… -- <prompt>` přes `$.process.run` (cwd sezení, timeout 3 s) a vrátí `next({ ...e, context: [...e.context, text] })`.
- `policy.ts` — čistá logika: `recallArgv`, `parseVerdict`, `buildRecallContext` (hlavička + `- [typ] titulek (scope): úryvek`, bez značek `[match]`), `factCount` (český plurál).
- Po vložení zapíše `recordContext` (`shared/audit`) událost `{kind:"uma-context", source:"recall", factIds, scope:"prompt"}` do sidecaru `….uma.jsonl` (sdílený kontrakt souboru s `cc-agent-watchdog`, viz `shared/audit.ts` a README). Jen ID, žádný obsah; chyba zápisu prompt neovlivní.
- Vložení ukáže jeden řádek `$.ui.log` (`🧠 recall: 2 fakta`); bez nálezu je ticho.

## Kontrakt

- **Čte:** `settings` (`recall`).
- **Píše:** `recallSession` — `{ session, ids, failing }`: ID už vložených faktů v tomhle sezení (anti-echo, posílá se jako `--exclude` a filtruje i v pluginu) a příznak, že poslední běh selhal (chyba se hlásí jednou za sérii).
- **Procesy:** jen `uma` z `PATH`, jen `recall check`.

## Nepatří sem

| co | kam patří |
|---|---|
| zapnutí a vypnutí (`/uma recall`) | `uma-command` |
| zápis do paměti, schvalování | `write-gate` (a MCP server `uma`) |
| bilingvní dotaz z překladu promptu | zahozeno — pluginy spolu nemluví |
| zesílení faktu po vložení (`plasticity reinforce` z pi) | zahozeno — recall je jen čtení |

## Pasti

- **Recall je poradní.** Chyba, timeout, chybějící binárka, nečitelná odpověď → prompt projde beze změny; hlásí se jednou za sérii chyb (`failing`), ne při každém promptu.
- cwd musí být cwd sezení: engine podle git rootu omezuje recall na projekt; z cizího adresáře by se vzpomínky jiných projektů dostaly do tohoto.
- `--` před promptem je nutné: prompt začínající pomlčkou by engine bral za přepínač. Prompt se ořezává na 2000 znaků.
- Atom `recallSession` drží ID podle `$.session.id()`: nové sezení začíná s prázdným seznamem. Po `/compact` se ID drží dál, i když původní kontext zmizel (fakt se v tom sezení znovu nevloží) — případný reset by patřil na událost kompakce.
- Příkazy a prompty bez uživatelského původu (notifikace, peer, plugin) se přeskakují; test bez `origin` se bere jako uživatel.
