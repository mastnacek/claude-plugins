# cc-uma-memory

UMA (Universal Memory Architecture) pro Claude Code — paměť sdílená s pi

Obecná pravidla pro všechny pluginy (postup, architektura, pasti enginu, git
a vydání) jsou v kořenovém `../../CLAUDE.md` a v `../../docs/`.

Každý řez má vlastní `CLAUDE.md` s kontraktem a tabulkou **„Nepatří sem“**;
než do řezu sáhneš, přečti ji.

## Příkazy

```sh
# vše spouštěj ze složky pluginu (plugins/cc-uma-memory/)
claude plugin validate .        # validátor enginu: atomy, on/$, registrace
claude plugin test .            # všechny *.test.ts
scripts/vsa-check.sh            # hranice řezů
npx -y -p typescript tsc -p . --noEmit   # typy (po prvním načtení enginem)
```

**Brána před commitem: všechny čtyři zelené.**

Vývoj naživo: `claude --plugin-dir .` (hot reload). Je-li plugin zároveň
nainstalovaný z marketplace, nejdřív `claude plugin disable cc-uma-memory@mastnacek`,
jinak běží dvakrát.

## MCP server

`.mcp.json` v kořeni pluginu deklaruje server `uma` (`uma mcp serve --allow-writes`,
binárka z `PATH`); nástroje jsou `mcp__plugin_cc-uma-memory_uma__*`. Pocházejí z Rust
jádra sdíleného s pi (`pi-uma/core`) — nové nástroje se přidávají tam, ne v pluginu.
Zápis do paměti schvaluje řez `write-gate` (dialog před `uma_write` / `uma_supersede`), vzpomínky k promptu přidává řez `recall`.

## Architektura

```
hooks/
  register.tsx        kořen kompozice — jen zapojí řezy
  features/<řez>/     jedna funkce = jedna složka (hooky, logika, testy, CLAUDE.md)
  shared/             technika bez obchodní logiky; nezná řezy (dnes `openrouter.ts` — jedna otázka modelu na OpenRouteru, `proposal.ts` — model a texty dialogu návrhu zápisu, sdílené `write-gate` a `staging`; `translate.ts` — překlad faktů jen pro zobrazení: OpenRouter, cache sezení, poznámka při selhání; používá ho pět řezů; `suspicious.ts` — kontrola návrhu faktu na otrávení paměti, sdílí `write-gate` a `staging`; `audit.ts` — sidecar `….uma.jsonl` s ID faktů v kontextu, píší `recall` a `rules`, formát je sdílený kontrakt souboru s `cc-agent-watchdog`)
types/index.d.ts      kontrakt $.state — jediné místo, kde se řezy potkají
```

## Řezy

<!-- Jeden řádek na řez: název — co dělá jednou větou. -->
- uma-command — příkaz `/uma` (registrace, nápověda, doplňování, kreslení výstupu) a trvalé přepínače `/uma recall`, `/uma write-gate`, `/uma append`, `/uma immune`, `/uma immune-model`, `/uma humility`, `/uma shadow` a `/uma lang` (`$.store`, atom `settings`; jediný zapisovatel) a čtecí příkazy `/uma search|list|read|timeline|doctor|reindex|export|debt [list|clear]` (fakta ukazuje přeložená do češtiny, model čte originál).
- memory-guard — `/uma claude-memory [on|off] [--global]` vypne/zapne automatickou paměť Claude (`autoMemoryEnabled`) a stav drží pod promptem jako štítek `[💾 🟢 UMA]` / `[💾 🟡 UMA ⚠ CC]` (semafor za 💾: 🔴 dluhy, 🟡 paměť Claude nebo koncepty, jinak 🟢; + ` ⚖N` při otevřených dluzích, ` 📝N` při konceptech čekajících na posouzení). Ostatní podpříkazy `/uma` pošle dolů.
- recall — před promptem zeptá `uma recall check` a pasáže k úkolu přidá jako skrytý kontext (anti-echo přes `recallSession`); poradní, při chybě prompt projde beze změny.
- rules — aktivní fakty typu `decision` a `pattern` přidá do system promptu jako sekci `session` (port z pi, text doslova, nejvýš 10; vypíná `/uma append off`); načte je jednou za sezení; vedle nich vždy sekce `cc-uma-memory:language` (fakta zapisuj anglicky).
- debt — na konci tahu hlavního agenta zeptá `uma debt check` a při otevřených blokujících dluzích pošle modelu připomínku jako nový prompt (`$.prompt.submit`, nejvýš 2 na běh, pak jen řádek logu); počet dluhů jde do štítku ` ⚖N`.
- write-gate — dialog před `uma_write` / `uma_supersede` (náhled česky přeložený, ukládá se anglický originál), zákaz `Write`/`Edit` do úložiště dialog pro bash, který by měnil paměť (port `approval_gate` z pi), a brána `uma muscle run --confirm` (kroky z vlastního dry-runu, kontrola `--plan-hash`); `uma debt clear` v bashi je mutující.
- immune — imunitní interceptor (port z pi): před `Write`/`Edit`/`NotebookEdit` mimo úložiště UMA posoudí úpravu podle `uma risk pain`, pravidel a ast-grep kontraktů; režimy `/uma immune off|warn|ask|auto` (výchozí warn), dialog s doporučením z OpenRouteru (`shared/openrouter`), log rozhodnutí a plasticita, `/uma immune stats`.
- humility — brána pokory (port z pi): po verdiktu LOW z `uma_humility` zamítne `Write`/`Edit`/`NotebookEdit` do označeného adresáře, dokud model nepřečetl `required_reads` souborů (`Read`) a nenapsal řádek `Hypothesis: …`; výchozí vypnuto, `/uma humility on|off`.
- shadow — stínový pracovník (port z pi): obnova po pádu sestavení/testů (`Bash`), změna `Cargo.toml`/`package.json` (`Write`/`Edit`) a oprava od uživatele (`prompt.submit`) se přes `uma staging distill` uloží jako **koncepty** do `.uma/.staging/`, nikdy přímo do paměti; `/uma shadow on|off|jev` (výchozí on, jako v pi).
- staging — `/uma review` ukáže koncepty (přeložené pro zobrazení) dialogem jako `write-gate` (schválit / upravit / přeskočit / zamítnout → `uma staging approve|discard`), `/uma staging list|show|discard`, štítek ` 📝N` pod promptem.
- muscle-synthesis — opakovaná trojice příkazů v `Bash` se navrhne jako koncept rutiny (`uma staging create --type skill`, nikdy `uma muscle new`); vypíná ho `/uma shadow off`.
