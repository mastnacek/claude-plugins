# cc-agent-watchdog

Watchdog pro agenty: deník volání nástrojů, pravidla a skóre programátora a testera

Obecná pravidla pro všechny pluginy (postup, architektura, pasti enginu, git
a vydání) jsou v kořenovém `../../CLAUDE.md` a v `../../docs/`.

Každý řez má vlastní `CLAUDE.md` s kontraktem a tabulkou **„Nepatří sem“**;
než do řezu sáhneš, přečti ji.

## Příkazy

```sh
# vše spouštěj ze složky pluginu (plugins/cc-agent-watchdog/)
claude plugin validate .        # validátor enginu: atomy, on/$, registrace
claude plugin test .            # všechny *.test.ts
scripts/vsa-check.sh            # hranice řezů
npx -y -p typescript tsc -p . --noEmit   # typy (po prvním načtení enginem)
```

**Brána před commitem: všechny čtyři zelené.**

Vývoj naživo: `claude --plugin-dir .` (hot reload). Je-li plugin zároveň
nainstalovaný z marketplace, nejdřív `claude plugin disable cc-agent-watchdog@mastnacek`,
jinak běží dvakrát.

## Architektura

```
hooks/
  register.tsx        kořen kompozice — jen zapojí řezy
  features/<řez>/     jedna funkce = jedna složka (hooky, logika, testy, CLAUDE.md)
  shared/             technika bez obchodní logiky; nezná řezy
types/index.d.ts      kontrakt $.state — jediné místo, kde se řezy potkají
```

## Řezy

Watchdog **jen hlásí** („Just report back“): nikdy nezamítá volání ani nemění vstup nástroje. Role z env `CC_ROLE`
(`coder` | `tester`; bez ní orchestrátor, na kterého se pravidla nevztahují).

- `ledger` — po každém volání nástroje zapíše řádek do deníku sezení (`<kořen>/<hlavní repo>/<datum>_<role>_<id8>.jsonl`, bez obsahů a výstupů, tajemství redigovaná); nikdy neblokuje.
- `rules` — na konci tahu vyhodnotí deník podle pravidel W01–W29 (verze 1; zbytek viz „Verze 2“ v `features/rules/CLAUDE.md`), hledá ladicí zbytky a uloží skóre.
- `report` — `/watch report [last|all|<id>]` (scorecard v rámečku), `/watch rules`, štítek `[👁 85]` / `[👁 85 ⚠2]` / `[👁 0 ⛔]` pod promptem.

`hooks/shared/` nese hluboké moduly obou čtenářů deníku: `store` (umístění a zápis deníku), `shell` (tokenizér příkazů), `classify` + `checks` + `rules` + `judge`
(pravidla jako data, predikáty, skóre), `config` (`.claude/watchdog.json`), `redact`, `paths`, `output`. Řez `report` soudí i staré deníky stejným kódem jako `rules`
soudí běžící sezení, proto je logika ve `shared/` a ne v řezu. `shared/fixture.ts` a `shared/world.ts` jsou jen pro testy.

Události `session.start`, `turn.complete` a `session.end` se smějí hooknout jednou, proto je hookuje kořen (`hooks/register.tsx`) a volá funkce řezů.
Kořen také zapisuje závěrečný text tahu do deníku (pro W14) dřív, než `rules` vyhodnotí.
