# cc-reverse-spec

Reverse-engineers a verifiable spec (rules, tests, traceability) from an existing codebase so it can be rebuilt with proven parity.

Obecná pravidla pro všechny pluginy (postup, architektura, pasti enginu, git
a vydání) jsou v kořenovém `../../CLAUDE.md` a v `../../docs/`.

Každý řez má vlastní `CLAUDE.md` s kontraktem a tabulkou **„Nepatří sem“**;
než do řezu sáhneš, přečti ji.

## Příkazy

```sh
# vše spouštěj ze složky pluginu (plugins/cc-reverse-spec/)
claude plugin validate .        # validátor enginu: atomy, on/$, registrace
claude plugin test .            # všechny *.test.ts
scripts/vsa-check.sh            # hranice řezů
npx -y -p typescript tsc -p . --noEmit   # typy (po prvním načtení enginem)
```

**Brána před commitem: všechny čtyři zelené.**

Vývoj naživo: `claude --plugin-dir .` (hot reload). Je-li plugin zároveň
nainstalovaný z marketplace, nejdřív `claude plugin disable cc-reverse-spec@mastnacek`,
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

<!-- Jeden řádek na řez: název — co dělá jednou větou. -->
- `invariants` — `spec/invariants.md` jde jako sekce systémového promptu migračního projektu (`spec/rules/` existuje).
- `guard` — odmítne `Edit`/`Write`/`NotebookEdit` pod `legacy/` a `generated/` a řekne, co dělat místo toho.
- `drift` — `/reverse-spec check`: pravidla × důkazy × testy, zapíše `spec/confidence.md`.
- `status` — stavový řádek `spec ✔ ~ ?` s počty důvěry a pravidly bez testu.
