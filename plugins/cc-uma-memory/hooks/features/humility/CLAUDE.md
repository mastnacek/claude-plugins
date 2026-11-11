# Slice: humility

## Proč existuje

MCP nástroj `uma_humility` jen radí: verdikt LOW („paměť tohle místo nekryje“) model
může přečíst a rovnou psát. Řez dělá z verdiktu LOW závazné pravidlo pro první
úpravu (port brány pokory z pi, `hooks/humility_gate.ts` + `slices/humility/policy.ts`;
Proposal 11 §9 krok 4). Stavový automat je politika klienta, MCP server čtení
souborů nevidí. Kdyby zmizel, `uma_humility` zůstane radou.

## Co dělá

Výchozí **vypnuto** (jako `humilityGate` v pi), zapíná `/uma humility on`.

- `tool.call` na `mcp__plugin_cc-uma-memory_uma__uma_humility` (výsledek přes `await next(e)`): verdikt **LOW** = `familiarity: "low"` **a** `exploration_required: true` (obojí, jako v pi) označí za neznámé **adresáře** souborů z `files` volání (relativní cesty od cwd sezení). Počet `required_reads` je z výsledku (`3`, jinak 3). Každé volání **nahradí** předchozí označení: nový záměr začíná načisto, HIGH označení smaže. Bez `files` se nic neoznačí (jako v pi).
- `tool.call` na `Read`: přečtený soubor pod označeným adresářem (nejdelší shoda) se počítá, každý soubor jednou. `Grep` a `Glob` se nepočítají (pi počítal jen `read`; výpis shod není přečtený soubor).
- `tool.call` na `Write`, `Edit`, `NotebookEdit` do označeného adresáře: `{ deny }`, dokud není přečteno `required_reads` souborů **a** model nevyslovil hypotézu. Text je z pi (`[UMA Humility] … Read-Only Explorative Mode: read N more related file(s) …`), model ho čte, proto anglicky. Poté úprava projde a označení je potvrzené (další úpravy už přepis nečtou).
- Mutující `Bash` se **nehlídá** — pi bránu držel jen na `write` a `edit`; zadání říkalo „podle pi“.

### Hypotéza

MCP nástroj nemá `action=confirm`, takže hypotéza není volání nástroje, ale **řádek v odpovědi modelu**:
`Hypothesis: …` / `Hypotéza: …` (nejméně 10 znaků obsahu, tučné písmo a citace nevadí), napsaný **po** volání
`uma_humility` (hlídá se přes počet zpráv v okamžiku kontroly, `$.session.messages()`). Zdůvodnění: je to nejjednodušší
věrná cesta — pi chtělo od modelu hypotézu vyslovit slovy a uložit ji; tady zůstane viditelná ve vláknu a člověk ji
vidí a může ji opravit. Dialog `$.ui.ask` jsem zavrhl: pi ho dává jako *poslední dotaz* „pokračovat i tak?“ člověku, ne jako
způsob, jak hypotézu vyslovit; zdržoval by v `-p` a rozhodoval by člověk místo důkazu. Zadání a kontrakt chtějí deny, a ten říká přesně, co chybí.

## Kontrakt

- **Čte:** `settings` (`humility`).
- **Píše:** `humilityState` (jediný zapisovatel): `{ session, intent, since, flags: [{ dir, required, reads, confirmed }] }`. Jiné `session` než aktuální = prázdný stav (nové sezení vynuluje).
- **Procesy, síť, soubory:** žádné.

## Nepatří sem

| co | kam patří |
|---|---|
| přepínač `/uma humility` | `uma-command` |
| samotný verdikt (Familiarity Index, Jev) | MCP server `uma` (Rust jádro) |
| imunitní kontrola úprav podle pravidel a bolesti | `immune` |
| zákaz zápisu do úložiště UMA | `write-gate` |

## Pasti

- **Pořadí v kořeni:** `registerHumility` po `registerWriteGate` (úložiště odmítne dřív) a **před** `registerImmune`: humility je levná a bez procesů, takže zastavenou úpravu už immune nesoudí (`uma risk pain`, ast-grep, OpenRouter).
- **Hypotéza ve stejné zprávě jako `Write`:** bude-li text zprávy v transcriptu až po volání nástroje, první pokus se zamítne a druhý projde. Naživo neověřeno (testy jen s mocky).
- Matcher na MCP nástroj je přetypovaný: typy matcheru znají MCP názvy jen z posledního připojení serveru.
- Selhání řezu (čtení stavu, transcriptu) úpravu propustí — brána nesmí rozbít práci.
- Subagent: hook běží i pro jeho `Write`/`Edit`; hypotézu hledá v jeho vlastní konverzaci (`agentId`), označení je ale společné pro sezení.
- **Windows:** `absolute()` převádí `\` na `/` a písmeno disku na malé (`D:\a\b` = `d:/a/b`), zbytek cesty zůstává; označené adresáře jsou proto v malém tvaru disku.
- Změní-li se tvar `humilityState`, přidej `shape` atomu (dnes bez; stav je jen sezení).
