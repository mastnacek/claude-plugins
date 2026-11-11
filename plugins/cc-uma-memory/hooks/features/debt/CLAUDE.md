# Slice: debt

## Proč existuje

Model by mohl práci prohlásit za hotovou, ačkoli si sám (nástrojem `uma_debt`)
zapsal povinnosti, které zbývají. Řez na konci tahu hlavního agenta zeptá
Prospective Debt Ledger (`uma debt check`) a při otevřených blokujících
dluzích modelu připomínku pošle jako nový prompt, aby pokračoval. Port
`agent_before_settle` z pi (`slices/debt`). Kdyby zmizel, dluhy zůstanou jen
v ledgeru a model je smí tiše ignorovat.

## Co dělá

- `turn.complete` (`register.ts`, jen hlavní smyčka, `agentId` chybí) — `uma debt check --origin claude-code --json` (`$.process.run`, cwd sezení, timeout 5 s). `blocking > 0` a `reason === "answer"` → `$.prompt.submit({ text: reminder })` (bez `await`). Nejvýš **2 připomínky na běh**, pak jen jeden řádek `$.ui.log`.
- `turn.start` (hlavní smyčka) — tah, který není naše pokračování, začíná nový běh: počítadlo na 0.
- `command.run {uma}` — po `/uma debt …` (po `next`) znovu přečte ledger, aby štítek hned odpovídal (`clear`).
- `policy.ts` — čistá logika: `checkArgv`, `parseReport`, `decide` (port `decideDebtEnforcement`), texty řádků logu.

## Jak model pokračuje

Hook `turn.complete` smí vrátit jen `{ text }` (typ `TurnCompleteResult`), pokračování
vynutit neumí (v pi to dělá `continue: true`). Proto `$.prompt.submit`: vlastní tah, jakmile
je sezení volné; ostatní hooky ho vidí s `origin.kind === "plugin"` (recall ho přeskočí).
`await` nesmí být: resolvuje se, až nový tah začne, a hook má rozpočet.

**Běh** = prompt uživatele + pokračování, která jsme sami spustili (u pi „agent run“ je totéž:
jeden `agent_start`…`agent_settle`). Rozpoznání: před `$.prompt.submit` se nastaví
`continuing`; další hlavní `turn.start` ho spotřebuje a počítadlo nechá, jinak počítadlo nuluje.
(`prompt.submit` tu hookovat nejde — bez matcheru ho už má `recall`.)

## Kontrakt

- **Píše:** `debtState` — `{ blocking, reminders, continuing, failing }` (jediný zapisovatel).
- **Čtou ho:** `memory-guard` (`blocking` → štítek ` ⚖N` pod promptem).
- **Procesy:** jen `uma debt check`.

## Nepatří sem

| co | kam patří |
|---|---|
| `/uma debt list\|clear` | `uma-command` |
| zápis dluhů (`uma_debt` add/settle) | MCP server `uma` (Rust jádro) |
| kreslení štítku | `memory-guard` |
| dialog před `uma debt clear` v bashi | `write-gate` |

## Pasti

- **Pořadí v kořeni:** `registerDebt` před `registerUmaCommand` — jeho `command.run` volá `next` (uma-command odpoví) a teprve potom znovu čte ledger. Test „/uma debt clear refreshes the label“ to hlídá.
- Chyba binárky, mimo git repo, timeout, nečitelný výstup → žádné dluhy, `$.ui.log` jednou za sérii (`failing`).
- Přerušený tah / chyba / odmítnutí (`reason !== "answer"`) model nepopostrkují, štítek se obnoví.
- Uživatel napíše prompt dřív, než naše pokračování začne: ten tah spotřebuje `continuing` a počítadlo se nevynuluje. Horní mez dvou připomínek tím zůstává, jen se dřív vyčerpá.
- Štítek se obnovuje po každém tahu a po `/uma debt`; při startu sezení se nenačítá (první tah ho ukáže).
- Subagenti se přeskakují (jejich `turn.complete` nese `agentId`).
