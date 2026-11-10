# cc-theme-switcher

Rotates the Claude Code theme by the sun: dawn, day, dusk and night palettes.

Obecná pravidla pro všechny pluginy (postup, architektura, pasti enginu, git
a vydání) jsou v kořenovém `../../CLAUDE.md` a v `../../docs/`.

Každý řez má vlastní `CLAUDE.md` s kontraktem a tabulkou **„Nepatří sem“**;
než do řezu sáhneš, přečti ji.

## Příkazy

```sh
# vše spouštěj ze složky pluginu (plugins/cc-theme-switcher/)
claude plugin validate .        # validátor enginu: atomy, on/$, registrace
claude plugin test .            # všechny *.test.ts
scripts/vsa-check.sh            # hranice řezů
npx -y -p typescript tsc -p . --noEmit   # typy (po prvním načtení enginem)
```

**Brána před commitem: všechny čtyři zelené.**

Vývoj naživo: `claude --plugin-dir .` (hot reload). Je-li plugin zároveň
nainstalovaný z marketplace, nejdřív `claude plugin disable cc-theme-switcher@mastnacek`,
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

- `rotation` — při startu a pak každou minutu zapíše téma aktuálního slotu do `~/.claude/themes/tts.json` (jen při změně).
- `tts-command` — `/tts`: stav, zapnutí/vypnutí, hold, přiřazení palet, poloha, herdr; výstup přes `CommandOutput`.

Sdílené (`hooks/shared/`): `solar` (výška slunce → slot), `palettes` (pět palet,
mapování pi barev na tokeny Claude Code, `mix`), `settings` (`~/.claude/cc-theme-switcher.json`,
validace po polích), `apply` (výběr slotu a idempotentní zápis `tts.json`),
`herdr/` (úprava `config.toml` herdru + reload), `selected-theme` (je vybrané `custom:tts`?).

## Jak téma přepíná

Claude Code čte vlastní téma ze souboru `~/.claude/themes/<slug>.json` a změnu
sleduje za běhu; `$.theme.set` v terminálu neexistuje. Plugin proto přepisuje
jediný soubor `tts.json` (`{ name, base, overrides }`) a uživatel jednou vybere
v `/theme` téma `tts` (uloží se `"theme": "custom:tts"`). Složku, která při
startu Claude Code neexistovala, je třeba jednou restartovat.

Palety jsou data v kódu (`shared/palettes.ts`), ne JSON: plugin nečte nic ze
své složky a mapování pi → tokeny je vedle barev. Pi barvy jsou už rozbalené
z `vars`; okhsl z `tts-night` je převedený na hex. Tlumené `warning` =
smíchané 50:50 s `muted` (v pi byla žlutá v řádku `auto mode on` moc výrazná).

Herdr (`syncHerdr`, ve výchozím stavu vypnuto) běží jen na požádání; jinak se
jeho config nečte. Zápis `config.toml` není atomický (`$.fs` nemá rename).
