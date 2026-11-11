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
  shared/             technika bez obchodní logiky; nezná řezy (dnes `openrouter.ts` — jedna otázka modelu na OpenRouteru)
types/index.d.ts      kontrakt $.state — jediné místo, kde se řezy potkají
```

## Řezy

<!-- Jeden řádek na řez: název — co dělá jednou větou. -->
- uma-command — příkaz `/uma` (registrace, nápověda, doplňování, kreslení výstupu) a trvalé přepínače `/uma recall`, `/uma write-gate`, `/uma append`, `/uma immune` a `/uma immune-model` (`$.store`, atom `settings`; jediný zapisovatel) a čtecí příkazy `/uma search|list|read|timeline|doctor|reindex|export|debt [list|clear]`.
- memory-guard — `/uma claude-memory [on|off] [--global]` vypne/zapne automatickou paměť Claude (`autoMemoryEnabled`) a stav drží pod promptem jako štítek `[UMA]` / `[UMA ⚠ CC]` (+ ` ⚖N` při otevřených dluzích). Ostatní podpříkazy `/uma` pošle dolů.
- recall — před promptem zeptá `uma recall check` a pasáže k úkolu přidá jako skrytý kontext (anti-echo přes `recallSession`); poradní, při chybě prompt projde beze změny.
- rules — aktivní fakty typu `decision` a `pattern` přidá do system promptu jako sekci `session` (port z pi, text doslova, nejvýš 10; vypíná `/uma append off`); načte je jednou za sezení.
- debt — na konci tahu hlavního agenta zeptá `uma debt check` a při otevřených blokujících dluzích pošle modelu připomínku jako nový prompt (`$.prompt.submit`, nejvýš 2 na běh, pak jen řádek logu); počet dluhů jde do štítku ` ⚖N`.
- write-gate — dialog před `uma_write` / `uma_supersede`, zákaz `Write`/`Edit` do úložiště dialog pro bash, který by měnil paměť (port `approval_gate` z pi), a brána `uma muscle run --confirm` (kroky z vlastního dry-runu, kontrola `--plan-hash`); `uma debt clear` v bashi je mutující.
- immune — imunitní interceptor (port z pi): před `Write`/`Edit`/`NotebookEdit` mimo úložiště UMA posoudí úpravu podle `uma risk pain`, pravidel a ast-grep kontraktů; režimy `/uma immune off|warn|ask|auto` (výchozí warn), dialog s doporučením z OpenRouteru (`shared/openrouter`), log rozhodnutí a plasticita, `/uma immune stats`.
