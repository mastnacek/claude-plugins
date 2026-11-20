# cc-herdr-plugin-dev

Psaní herdr pluginů: skill s dokumentací, kostra, validace manifestu a brány před úpravou

Obecná pravidla pro všechny pluginy (postup, architektura, pasti enginu, git
a vydání) jsou v kořenovém `../../CLAUDE.md` a v `../../docs/`.

Každý řez má vlastní `CLAUDE.md` s kontraktem a tabulkou **„Nepatří sem“**;
než do řezu sáhneš, přečti ji.

## Příkazy

```sh
# vše spouštěj ze složky pluginu (plugins/cc-herdr-plugin-dev/)
claude plugin validate .        # validátor enginu: atomy, on/$, registrace
claude plugin test .            # všechny *.test.ts
scripts/vsa-check.sh            # hranice řezů
npx -y -p typescript tsc -p . --noEmit   # typy (po prvním načtení enginem)
```

**Brána před commitem: všechny čtyři zelené.**

Vývoj naživo: `claude --plugin-dir .` (hot reload). Je-li plugin zároveň
nainstalovaný z marketplace, nejdřív `claude plugin disable cc-herdr-plugin-dev@mastnacek`,
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

Plugin pomáhá psát herdr pluginy (`herdr-plugin.toml`, herdr 0.9.5). Skill `herdr-plugin-dev` s offline dokumentací
je **data** v `skills/herdr-plugin-dev/` (engine ho najde sám, v `plugin.json` není); řezy mu dodávají nástroje a brány.
**Brány platí jen uvnitř herdr projektu** (předek souboru, nebo cwd sezení, obsahuje `herdr-plugin.toml`); jinde plugin
nic nezamítá a nic nepřidává do kontextu.

- `scaffold` — nástroj `herdr_scaffold_plugin`: kostra pluginu v Rustu / TypeScriptu / Bashi (nepřepíše existující manifest).
- `manifest` — nástroj `herdr_validate_manifest`: kontrola `herdr-plugin.toml` podle pravidel herdru.
- `command` — `/herdr-plugin scaffold | validate | docs` s doplňováním a výstupem v rámečku.
- `docs-gate` — Edit/Write zdrojáku v herdr projektu se zamítne, dokud sezení nečetlo skill / `references/`; sekce v system promptu.
- `line-limit` — zdrojový soubor v herdr projektu nad 400 řádků je chyba (od 300 varování).

`hooks/shared/` nese hluboké moduly: `toml` + `manifest` (čtečka a pravidla manifestu), `scaffold` (soubory kostry),
`actions` (zápis kostry a čtení manifestu přes `$.fs` — používá je nástroj i příkaz), `project` (poznání herdr projektu a zdrojáků).
`world.ts` je jen pro testy. `session.start` hookuje kořen a volá `startXxx($)` řezů.

## Pasti

- **Typy pro `tsc`** (`.claude-plugin/types/`) vznikají jen při interaktivním načtení pluginu enginem
  (`claude --plugin-dir .` v terminálu); `claude -p` je nevytvoří. Bez nich `tsc` hlásí `Cannot find module 'claude-code'`.
- **Brána `docs-gate` se hookuje první** (kořen), aby zamítnutá úprava nedošla k `line-limit`.
- **Zdroják vs. dokument:** brány hlídají jen přípony zdrojáků (`.rs`, `.ts`, `.sh`, …); `.md`, `.toml`, `.json` a `node_modules`/`target`/`dist` jsou mimo.
