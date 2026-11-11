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

Watchdog **ve výchozím stavu jen hlásí** („Just report back“): každé pravidlo je v režimu `report`, který nezamítá volání ani nemění vstup
nástroje. Volání zamítne jen pravidlo, které někdo výslovně přepnul na `block` (řez `guard`), a výjimku z pravidla (bez instant failure) uděluje
člověk v dialogu (řez `waiver`). Role z env `CC_ROLE` (`coder` | `tester`; bez ní orchestrátor, na kterého se pravidla nevztahují).

- `ledger` — po každém volání nástroje zapíše řádek do deníku sezení (`<kořen>/<hlavní repo>/<datum>_<role>_<id8>.jsonl`, bez obsahů a výstupů, tajemství redigovaná); nikdy neblokuje.
- `rules` — na konci tahu vyhodnotí deník podle pravidel W01–W29 (verze 1; zbytek viz „Verze 2“ v `features/rules/CLAUDE.md`), hledá ladicí zbytky a uloží skóre; `/watch rules` (stav, režim a zdroj každého pravidla, otevřené výjimky) a `/watch rule <id> on|off|report|block [--global]` (zápis do `.claude/watchdog.json` nebo `$.store`).
- `guard` — režim `block`: `tool.call` zamítne **před provedením** volání, které porušuje pravidlo v režimu `block` a nemá platnou výjimku; chyba vyhodnocení = volání projde.
- `waiver` — nástroj `watchdog_waiver` (žádost o výjimku, dialog `$.ui.ask`, řádek `kind:"waiver"` do deníku); instant-fail pravidla odmítne bez dialogu.
- `report` — `/watch report [last|all|<id>]` (scorecard v rámečku, povolená porušení `✅ povoleno výjimkou …`, souhrn výjimek), doplňování argumentů `/watch`, štítek se semaforem `[👁 🟢 100]` / `[👁 🟡 85 ⚠️2]` / `[👁 🔴 0 ⛔]` pod promptem; je-li vedle deníku sidecar `….uma.jsonl` z `cc-uma-memory`, přidá ke každému porušení řádek `🧠 fakty v kontextu: …` a do souhrnu počet faktů UMA (sdílený kontrakt souboru, `shared/uma.ts`).

`hooks/shared/` nese hluboké moduly obou čtenářů deníku: `store` (umístění a zápis deníku), `shell` (tokenizér příkazů), `classify` + `checks` + `rules` + `judge`
(pravidla jako data, predikáty, skóre), `config` (`.claude/watchdog.json` + globální nastavení z `$.store`), `settings` (výchozí < globální < projekt: zapnuto/vypnuto, režim, zdroj),
`waivers` (okna platnosti výjimek v deníku), `block` (posouzení volání před provedením, text zamítnutí), `redact`, `paths`, `output`, `uma` (čtení sidecaru faktů UMA — jediné, co plugin sdílí s `cc-uma-memory`, a to jako formát souboru, ne kód). Řez `report` soudí i staré deníky stejným kódem jako `rules`
soudí běžící sezení, proto je logika ve `shared/` a ne v řezu. `shared/fixture.ts` a `shared/world.ts` jsou jen pro testy.

Události `session.start`, `turn.complete` a `session.end` se smějí hooknout jednou, proto je hookuje kořen (`hooks/register.tsx`) a volá funkce řezů.
Kořen také zapisuje závěrečný text tahu do deníku (pro W14) dřív, než `rules` vyhodnotí.
