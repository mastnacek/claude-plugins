# Orchestrace agentů v herdr — kanonický postup

**Jediné místo pro postup orchestrace** pro všechna repa (claude, spai, anon, …). Repa mají
jen krátký `docs/herdr-orchestrace.md` s odkazem sem a se svými specifiky (brána, testovací
data). Platí, kdykoli sezení běží v herdr (`HERDR_ENV=1`). Uživatel mluví jen s tebou; ty jsi
**orchestrátor** a práci rozdáváš agentům v jejich vlastních panelech, ne subagentům (`Agent`).

| role | panel | spuštění | dělá |
|---|---|---|---|
| **orchestrátor** | vlevo, celá výška | — | rozpad práce na zadání (SPAI), kontrola výsledku a brány, **jediný commit, sloučení a push**, komunikace s uživatelem |
| **programátor** | vpravo nahoře | `scripts/agent.sh coder` (Sonnet, `CODE_MODE=1` volitelně) | píše kód ve svém worktree; zprávu commitu jen navrhne |
| **tester** | vpravo pod programátorem | `scripts/agent.sh tester` (Haiku) | ověřuje podle scénáře nad testovacími daty; kód nemění |
| **kolega** | vpravo dole, malý (hlídač skrytě na pozadí) | `scripts/kolega.sh`, startuje sám s agenty (§ Kolega) | čte přepisy všech sezení, hodnotí postup, hlásí postřehy |

Najednou nejvýš jeden programátor, jeden tester a jeden revizor.

## Spouštění agentů

- **Windows:** shell panelu je PowerShell a holý `bash` spustí WSL. Agenta spouštěj přes Git Bash
  a předej mu scratchpad:
  `herdr pane run <pane> "$env:AGENT_SCRATCH='<scratchpad>'; & 'C:\Program Files\Git\bin\bash.exe' scripts/agent.sh coder"`.
- `scripts/agent.sh` dá agentovi `CC_ROLE`, model a pravidla role z **`D:/01_programovani/claude/prompts/<role>.md`**
  (jedna sada pro všechna repa) + `prompts/<role>.local.md` repa, je-li. Agenty spouštěj vždy
  přes něj, nikdy holým `claude`. Git zápis agentům zakazuje hook / watchdog repa.
- **Každá nová práce začíná v čistém sezení:** `/exit` a znovu `agent.sh`.
- **Z Git Bash posílej lomítkové příkazy s `MSYS_NO_PATHCONV=1`** — jinak `"/exit"` dorazí jako
  `C:/Program Files/Git/exit` a agent běží dál. Před `pane run` ověř, že v panelu je shell
  (`herdr pane process-info`).
- Nová složka vyvolá dialog důvěry: `send-keys Down`, pak `Enter` (opakovat i pro `--add-dir`).
- ID panelu ber z JSON odpovědi `pane split` (`.result.pane.pane_id`), nikdy z odhadu.

## Panely

```
┌──────────────────────┬──────────────────────┐
│                      │ programátor (Sonnet) │
│ orchestrátor (Opus)  ├──────────────────────┤
│   celá výška         │ tester / pozorovatel │
└──────────────────────┴──────────────────────┘
```

- Nové panely vždy `--no-focus` a rozdělením panelu vpravo, nikdy tvého (zůstáváš na celou výšku).
- `herdr pane move` uvnitř jedné karty nefunguje; jde to přes dočasnou kartu
  (`move --new-tab`, pak `move --tab <karta> --split down --target-pane <cíl> --ratio 0.75`)
  a dočasnou kartu zavři.
- Šířku panelů neměň. Zavírej jen panely, které jsi otevřel.

## Worktree

- Programátor pracuje ve vlastním worktree: `git worktree add -b agent/<úkol> ../<repo>-<úkol>`
  (v Git Bash cesta `D:/…`, ne `/d/…`).
- Po sloučení `git worktree remove --force` + `git worktree prune` + `git branch -d`; na Windows
  bývá složka chvíli zamčená běžícím procesem — smaž ji, až agent skončí.
- Sdílený `CARGO_TARGET_DIR` klame bránu (přeskočí překlad jiného stromu): ve worktree vlastní target.

## Zadání = záznam SPAI

Každé zadání agentovi je **záznam SPAI** v backlogu hlavního repa (ne worktree).

1. **Zápis:** `spai add "<řádek>\n<tělo>" --project <hlavní repo> --source orchestrator`.
   Řádek `. <cíl jednou větou> :agent:coder:` (`:tester:`, `:review:`), anglicky. Tělo:
   hlavička konstant (`WORKDIR`, `SCRATCH`, `ALLOWED_PATHS`, `GATE`, `HARD_CONSTRAINTS`,
   `REMOTE_ALLOW`), cíl, rozsah a co je mimo, testy, kritérium hotovo, návrh commitu.
   **Každé zadání, které mění chování viditelné uživateli, má oddíl `## SMOKE`:** živý scénář
   přes celý řetězec (skutečná binárka / nainstalovaný plugin, vymyšlená data ve scratchpadu),
   kroky jako od uživatele a očekávaný výsledek každého. Testy řezu ani zelená brána ho
   nenahrazují (2026-11-20..22: třikrát „hotovo“ se zelenou bránou a chybou v živém běhu).
   **Kroky SMOKE, které potřebují agenta (spustit claude, testera, panel), pouští orchestrátor,
   nikdy programátor** — v zadání je označ „orchestrátor:“. Agentům spouštění agentů technicky
   zakazuje `agent.sh` (`--disallowedTools Agent` + hook `.claude/hooks/agent-no-spawn.sh`).
   Navazující úkoly řetěz přes `--after <ID>`; plán celé práce zapiš najednou.
2. **Odeslání:** `spai set <ID> working`, pak agentovi jen
   „Read SPAI-012 @<projekt> (`spai show SPAI-012 --project <hlavní repo> --json`) and carry it out fully now.“
   Jen „Do SPAI-012: spai show …“ nestačí — Haiku si záznam jen přečte.
   Hned po odeslání `scripts/task-link.sh <ID> <hlavní repo> <panel>` zapíše do logu úkolu
   sezení a přepis agenta i přepis orchestrátora (env `CLAUDE_SESSION`, jinak nejnovější
   `*.jsonl` v adresáři projektu aktuální složky). Z nich pak `scripts/workflow-grade.py <ID>
   --project <hlavní repo>` ohodnotí řádky klíče `check = "script"` a zapíše
   `docs/workflow-hodnoceni/<ID>.jsonl`.
3. **Konec:** po sloučení `spai set <ID> done --evidence "<commit>, <brána>"`; zahozené
   `cancelled`. Výtky a předání `spai log <ID> "<text>"`.
4. Agent záznamy nemění. Scratchpad je pro sondy, logy, testovací kopie a patche.

## Čekání a kontrola

- **Čekání: vždy `D:/01_programovani/claude/scripts/agent-wait.sh <panel>` na pozadí** hned po
  odeslání zadání. Konec tahu pozná z přepisu agenta (poslední zpráva asistenta `end_turn`, novější
  než přepis při startu skriptu), ne jen z panelu; u agentů bez přepisu čte obsah panelu.
  Vypíše jeden řádek: `done <panel> <přepis>:<řádek>` (exit 0), `blocked <panel>` (exit 2),
  `timeout <panel>` (exit 1). Žádné `sleep` navíc.
- `blocked` = agent čeká na dialog: přečti panel a **ukaž ho uživateli**, neodpovídej za něj.
- Pokud `--wait` vyprší, prompt neposílej znovu naslepo — nejdřív `agent get` a `agent read`.
- Závěrečnou zprávu čti z přepisu: nejnovější `~/.claude/projects/<cesta-cwd>/*.jsonl`.
- **Výsledek ověř sám:** `git status` a `git diff --stat` ve worktree (soubory jen z
  `ALLOWED_PATHS`), celou bránu pusť sám, tvrzení zprávy ověř v datech. Vadný výsledek vrať
  s konkrétní výtkou (`spai log`), neopravuj ho potichu.
- **Před sloučením projde `SMOKE`:** scénář pusť ty nebo tester (tabulka krok → výsledek →
  OK/FAIL). Výstup, který by čtení orchestrátora zkreslil (vlastní plugin maskuje), zakóduj
  (rot13) nebo čti z testerova panelu. Bez `SMOKE` OK se neslučuje.
- Po sloučení release build a instalace, uklidit worktree, větev a panel.

## Zadání testerovi

Scénář = kroky jako od uživatele a očekávaný výsledek každého; tester odpoví tabulkou
krok → výsledek → OK/chyba. Testuje nad **kopií** dat ve scratchpadu, nikdy nad skutečnými.
Příkazy pluginu (`/…`) a dialogy v jeho okně obsluhuješ ty; rozhraní čteš z panelu.

## Kolega (pair programmer)

Role **kolega**: druhý agent jen ke čtení sleduje orchestrátora i všechny agenty (programátor,
tester, fable) a hlásí postřehy. Zadání role: `prompts/kolega.md`.

- **Spouští se sám:** `scripts/agent.sh` při startu každého agenta zavolá `scripts/kolega.sh`
  (idempotentní; `NO_KOLEGA=1` ho vypne). Orchestrátor ho může spustit i ručně na začátku práce.
- **Agent kolegy:** `scripts/kolega.sh --agent agy|pi|claude` (výchozí `claude`, nebo `KOLEGA_AGENT`).
  `claude`: `--model sonnet`, povolené Read, Grep, Glob, zakázané Write, Edit, NotebookEdit, Bash,
  `CC_ROLE=kolega` (watchdog ho bere jako agenta), `NO_KOLEGA=1` (nespustí dalšího kolegu).
  `agy`: `--dangerously-skip-permissions --mode plan`, `deny command(*)` (agy narazil na limit).
  `pi`: model z `KOLEGA_PI_MODEL` (bez něj výchozí model pi), `--exclude-tools bash,edit,write`. Všichni čtou `~/.claude/projects`,
  `D:/01_programovani` a scratchpad. Panel se jmenuje „kolega (<agent>)“; hlídač nemá panel,
  běží skrytě na pozadí (`Start-Process -WindowStyle Hidden`), výpis v `watch.log` stavové
  složky pluginu.
- **Hlídač řízený událostmi** (plugin `kolega.observer`, repo herdr, `plugins/herdr-kolega`):
  herdr při změně stavu agenta (`pane.agent_status_changed`: blocked, done, idle), nálezu agenta
  (`pane.agent_detected`) a konci panelu (`pane.exited`) spustí `herdr-kolega event`, který připíše
  řádek do fronty ve `HERDR_PLUGIN_STATE_DIR`. Na pozadí běží `herdr-kolega watch --pane
  <kolega> --debounce-s 4`: shluky událostí sloučí (4 s klidu, nejvýš 16 s), `blocked` pošle hned,
  počká na `herdr agent wait <kolega> --until idle --until done` a pošle jednu pobídku. Pobídka
  říká u každého sezení roli, panel, **důvod** (blokováno, tah dokončen, nové sezení, sezení
  ukončeno), přepis a **řádky ke čtení** (kurzor na přepis; poprvé posledních 400). Agenty jiné než
  Claude (pi …) nemají přepis: pobídka uvede panel a `herdr agent read`. Události kolegova panelu se
  ignorují. Záloha: 60 min bez události a přepis narostl → jedna pobídka.
- **Zapojení:** `kolega.sh` použije plugin, jen když je zapojen (`herdr plugin link` v repu herdr,
  `cargo build --release`) a binárka existuje (`KOLEGA_PLUGIN_BIN`); jinak spustí záložní
  `scripts/kolega-watch.sh` (polling po `--interval`, výchozí 10 min). Akce pluginu `start` volá
  `kolega.sh` (`KOLEGA_SCRIPT`).
- **Je to kolega, ne autorita:** každý postřeh ověř v přepisu a podle konvencí; uživateli řekni,
  co platí, co jen zčásti a co ne. Platné zapiš do SPAI `:workflow:`. Agy posílá přepisy Googlu.

## Poznatky o postupu práce

**Jediné místo:** záznamy SPAI v backlogu tohoto repa (`D:/01_programovani/claude/docs/spai/`),
poznámka `- <poznatek> :workflow:` se zdrojem (agy, uživatel, orchestrátor) a důkazem v těle.
Schválený poznatek se zapracuje sem nebo do `prompts/<role>.md` a záznam dostane
`done --evidence "<commit>"`. Nikdy ne do souborů pluginu nebo projektu, kterého se netýká.

## Eskalace na Fable — rozhoduje uživatel

`claude --model fable` jen na návrh těžko měnitelného rozhraní, revizi bezpečnostně kritického
kódu nebo problém, který programátor nevyřešil ani na druhý pokus. **Nikdy ho nespouštěj sám:**
navrhni co, proč a jak velké; spusť až po výslovném souhlasu, ve vlastním panelu.
