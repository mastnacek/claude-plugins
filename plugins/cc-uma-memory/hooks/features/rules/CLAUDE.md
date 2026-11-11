# Slice: rules

## Proč existuje

Recall vkládá vzpomínky k úkolu, ale rozhodnutí a vzory projektu mají platit vždy,
ne jen když se hodí k promptu. Řez je přidá do system promptu jako jednu sekci
(port `fetchActiveRules` + `formatRulesForSystemPrompt` z pi). Kdyby zmizel,
model by pravidla znal jen z recallu a z nástrojů MCP.

## Co dělá

- `prompt.compose` (`register.ts`) — je-li `settings.append` zapnuto, zeptá `uma list --json --type decision` a `… --type pattern` (cwd sezení, timeout 5 s) a k sekcím, které vrátil `next`, připojí jednu sekci `cc-uma-memory:rules` se scope `session`.
- `prompt.compose` přidá **vždy** i sekci `cc-uma-memory:language` (`LANGUAGE_RULE`, scope `session`, anglicky): `title`, `body` a `tags` u `uma_write` / `uma_supersede` psát anglicky, i když uživatel píše česky; uživatel vidí český překlad (display-only, řez `write-gate`). Nezávisí na `/uma append` — to vypíná jen pravidla z paměti. Žádné automatické zamítnutí podle jazyka.
- Při každém **načtení** pravidel (jednou za sezení, ne při každém požadavku) zapíše `recordContext` (`shared/audit`) `{kind:"uma-context", source:"rules", factIds, scope:"session"}` — ID pravidel, která opravdu šla do promptu (nejvýš 10) — do sidecaru `….uma.jsonl` (sdílený kontrakt souboru s `cc-agent-watchdog`). Jen ID; chyba zápisu prompt neovlivní. Jazyková sekce není fakt, nezapisuje se.
- `policy.ts` — čistá logika: `rulesArgv`, `parseRules`, `formatRules` (text doslova jako v pi, anglicky, nejvýš 10 pravidel, první řádek těla).
- Žádná pravidla → žádná sekce pravidel (jazyková sekce zůstává).

## Kontrakt

- **Čte:** `settings` (`append`).
- **Píše:** `rulesSession` — `{ session, text, failing }`: text sekce načtený jednou za sezení (`null` = ještě nenačteno, `""` = žádná pravidla) a příznak, že poslední načtení selhalo (log jednou za sérii).
- **Procesy:** jen `uma` z `PATH`, jen `list --json`.

## Nepatří sem

| co | kam patří |
|---|---|
| přepínač `/uma append` | `uma-command` |
| vzpomínky k promptu | `recall` |
| zápis faktů | `write-gate` (a MCP server `uma`) |
| překlad faktů pro zobrazení | `shared/translate` (používají `write-gate`, `staging`, `uma-command`, `immune`) |

Proč jazyková věta tady a ne v novém řezu: `prompt.compose` bez matcheru smí v pluginu hookovat jen jeden řez a vlastní ho `rules`; jazyk zápisu je kus „pravidel pro model“. Řez by byl pod 50 řádků bez vlastního stavu (Rule of Three, `docs/architektura.md`).

## Pasti

- **`prompt.compose` se volá pro každý požadavek** (a při každém `$.prompt.compose()` jiného pluginu), proto se text bere z `rulesSession` a `uma` se nespouští znovu. Stabilní prompt drží cache poskytovatele; fakt zapsaný během sezení se v pravidlech objeví až v dalším sezení.
- Selhání (binárka chybí, kód ≠ 0, nečitelný JSON u kteréhokoli typu) se **nekešuje**: další požadavek to zkusí znovu; hlásí se jednou za sérii. Prompt se vrací, jak ho složil engine.
- Sekce musí jít za sekce enginu (`session` až po všech `shared`); přidává se na konec seznamu.
- cwd musí být cwd sezení — `uma list` omezuje projekt podle git rootu.
- Vypnutí (`append off`) platí hned, i když je text v cache.
