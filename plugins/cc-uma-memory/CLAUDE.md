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
  shared/             technika bez obchodní logiky; nezná řezy
types/index.d.ts      kontrakt $.state — jediné místo, kde se řezy potkají
```

## Řezy

<!-- Jeden řádek na řez: název — co dělá jednou větou. -->
- uma-command — příkaz `/uma` (registrace, nápověda, doplňování, kreslení výstupu) a trvalé přepínače `/uma recall`, `/uma write-gate` a `/uma append` (`$.store`, atom `settings`; jediný zapisovatel) a čtecí příkazy `/uma search|list|read|timeline|doctor|reindex|export`.
- memory-guard — `/uma claude-memory [on|off] [--global]` vypne/zapne automatickou paměť Claude (`autoMemoryEnabled`) a stav drží pod promptem jako štítek `[UMA]` / `[UMA ⚠ CC]`. Ostatní podpříkazy `/uma` pošle dolů.
- recall — před promptem zeptá `uma recall check` a pasáže k úkolu přidá jako skrytý kontext (anti-echo přes `recallSession`); poradní, při chybě prompt projde beze změny.
- rules — aktivní fakty typu `decision` a `pattern` přidá do system promptu jako sekci `session` (port z pi, text doslova, nejvýš 10; vypíná `/uma append off`); načte je jednou za sezení.
- write-gate — dialog před `uma_write` / `uma_supersede`, zákaz `Write`/`Edit` do úložiště a dialog pro bash, který by měnil paměť (port `approval_gate` z pi).
