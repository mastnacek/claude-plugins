# Slice: tool-mask

## Proč existuje

Výsledky nástrojů nesou originály z disku a z příkazů. Řez je maskuje, než je
agent uvidí, a vstupy, které agent napsal s falešnými hodnotami, vrací nástrojům
zpět na originály. Bez něj by agent četl originály nebo by Edit nenašel text.

## Co dělá

- `tool.call` na `Read|Grep|Bash|PowerShell|Edit|Write|NotebookEdit|NotebookRead|mcp__*` (`register.ts`):
  - `Read` v `~/.claude/projects/**` a dalších složkách stavu agentů projde bez maskování; jinak při prvním čtení souboru dialog s `anon scan` a volbou „Povolit“.
  - `Bash`/`PowerShell` (`command`), `Edit` (`file_path`, `old_string`, `new_string`), `Write` (`file_path`, `content`), `NotebookEdit` (`notebook_path`, `new_source`) — pole projdou `anon unmask` (`fields.ts`).
  - výsledek (všechny řetězce, tvar zůstává) a `context` projdou `anon mask`; chyba nástroje se vrací jako maskovaný `deny`.
- volba `style` (`default|fake|redact|tag`) se předává `anon mask --style`; `default` příznak nepošle (rozhodne `rules.toml` anonu). `unmask` styl nepotřebuje (fake i tag jdou vrátit).
- značky (`shared/tags.ts`): vstupní úplná značka, kterou anon v tomto sezení nevydal (`issuedTags`), se zamítne před `anon unmask`; `anon unmask --strict` vypíše značky, které nezná (částečná, jiná velikost, HTML/JSON escape); zamítne se zprávou „Neznámá nebo poškozená značka …“. Značka je jen s číslicemi: obecný zápis v dokumentaci (`druh`, `n` písmeny) je text.
- zápis `REDACTED` jako hodnoty (styl `redact`) se zamítne: Edit/Write/NotebookEdit jako hodnota v uvozovkách nebo za `=`/`:`, Bash/PowerShell jen u příkazu zapisujícího soubor; čtení a hledání projde; vstup `mcp__*` se značkou se zamítne (MCP značky neodmaskuje).
- `anon` chybí nebo selže → `deny` s jasnou zprávou (fail-closed).

## Kontrakt

- **`$.state`:** píše `notes` (čte `mask-note`); `issuedTags` píše `shared/anon.ts` při každém `mask`, čte `shared/tags.ts`.- **Shared:** `anon` (`convert`), `consent` (`isFileAllowed`).

## Nepatří sem

| co | kam patří |
|---|---|
| prompt a `@` soubory | `features/prompt-mask` |
| odkrytí odpovědi na obrazovce | `features/reply-unmask` |
| spouštění `anon` | `shared/anon.ts` |

## Pasti

- Výsledek se vrací jako vlastní `{ result }` bez `ref`/`text`; vrátit objekt z `next` by engine bral doslova a maskování by přišlo nazmar.
- `convert` spojí všechny řetězce výsledku jedním voláním `anon`; změní-li anon počet částí, je to chyba (deny).
- Nástroje mimo `Read|Grep|Bash|Edit|Write|mcp__*` (Glob, WebFetch…) se nemaskují.
