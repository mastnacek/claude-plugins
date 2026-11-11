# cc-pixel-buddy

Pixelová počítačová hlavička vedle chatu: nálada podle práce, užitečné hlášky a statistiky dne

Obecná pravidla pro všechny pluginy (postup, architektura, pasti enginu, git
a vydání) jsou v kořenovém `../../CLAUDE.md` a v `../../docs/`.

Každý řez má vlastní `CLAUDE.md` s kontraktem a tabulkou **„Nepatří sem“**;
než do řezu sáhneš, přečti ji.

## Příkazy

```sh
# vše spouštěj ze složky pluginu (plugins/cc-pixel-buddy/)
claude plugin validate .        # validátor enginu: atomy, on/$, registrace
claude plugin test .            # všechny *.test.ts
scripts/vsa-check.sh            # hranice řezů
npx -y -p typescript tsc -p . --noEmit   # typy (po prvním načtení enginem)
```

**Brána před commitem: všechny čtyři zelené.**

Vývoj naživo: `claude --plugin-dir .` (hot reload). Je-li plugin zároveň
nainstalovaný z marketplace, nejdřív `claude plugin disable cc-pixel-buddy@mastnacek`,
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

- `mood` — nálada postavičky podle práce (tabulka pravidel: spí, přemýšlí, slaví, ustaraný, spokojený, výchozí).
- `stats` — statistiky dne v `$.store`: tahy, chyby, úpravy, commity, testy.
- `hints` — užitečné hlášky (3× stejná chyba, kontext 80 %, 2 h práce, commit), každá jednou.
- `face` — kreslení: proužek nad promptem a panel.
- `command` — `/buddy`: stav, `open`, `close`, `mute on|off`.

`shared/classify.ts` pozná z volání nástroje commit, test, úpravu souboru (používají `mood`, `stats`, `hints`);
`shared/world.ts` je maketa enginu jen pro testy.

Události bez matcheru (`session.start`, `turn.start`, `turn.complete`, `tool.call`) hookuje jen kořen a volá funkce
řezů jménem. `tool.call` hook kořene jen čte výsledek (`next(e)`), nic nezamítá ani nepřepisuje.

## Nepatří sem

Péče o parťáka (feed / pet), zamítání nebo úpravy volání nástrojů a promptů, spouštění čehokoli, sdílení kódu či
stavu s jinými pluginy.
