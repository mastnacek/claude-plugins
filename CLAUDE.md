# mastnacek/claude-plugins

Marketplace vlastních pluginů pro Claude Code. Každý plugin žije ve
`plugins/<plugin>/` s vlastním `CLAUDE.md`, README, testy a verzí; uživatel
přidá marketplace jednou a pluginy instaluje zvlášť.

```
.claude-plugin/marketplace.json   seznam pluginů ("source": "./plugins/<plugin>")
plugins/<plugin>/                 jeden plugin = jedna složka, nic sdíleného mezi nimi
templates/plugin/                 šablona kostry nového pluginu
scripts/new-plugin.sh             kostra ze šablony + zápis do marketplace
docs/                             návody, čti podle odkazů níž
```

Filozofie: **logické, jednoduché, intuitivní.** Jedna věc na obrazovce = jeden
přepínač; kód, který nic nečte, se maže; abstrakce až při třetím použití.

## Postup u nového pluginu

Tři kroky, každý končí souhlasem uživatele, než začne další:

1. **Název.** Navrhni 2–3 názvy ve tvaru `cc-<název>-<funkce>`
   (`cc-uma-memory`), uživatel vybere. Hotovo, až je název
   schválený. Pravidla pro název: `docs/novy-plugin.md` § Název.
2. **Kostra.** `scripts/new-plugin.sh <název> "<popis jednou větou>"` na
   větvi `feat/<název>`. Hotovo, až oba validátory skončí `✔`.
3. **Programování.** Řez po řezu podle `docs/novy-plugin.md` § Programování;
   každý řez projde **bránou** a má vlastní commit.

**Port z pi** jde stejnými třemi kroky; mezi krokem 1 a 2 přidej inventuru
pi rozšíření podle `docs/port-z-pi.md`.

## Kam sáhnout

- **Práce v herdr** (vždy): ty orchestruješ vlevo; vpravo nad sebou programátor
  (Claude Code, Sonnet) a tester (Claude Code, Haiku), panely pojmenované
  podle rolí → `docs/herdr-orchestrace.md`
- **Nový plugin, krok za krokem** → `docs/novy-plugin.md`
- **Port rozšíření z pi** (tabulka pi → Claude Code, co zahodit) → `docs/port-z-pi.md`
- **Kód hooků:** řezy, hluboké moduly, pasti enginu, kdy nový řez → `docs/architektura.md`
- **Vzhled výstupu v TUI** (rámeček, barvy, emoji — vždy, když plugin něco vypisuje nebo kreslí) → `docs/vystup-v-tui.md`
- **API enginu** (`$`, události, `ui.render`, `$.state`, testy) → skill `plugin-authoring`
- **Balení a marketplace** (`plugin.json`, validace, `claude plugin eval`) → agent `claude-code-guide`
- **Commit, větve, vydání nové verze** → `docs/git-a-vydani.md`
- **Psaní `CLAUDE.md` řezu nebo skillu** → skill `mattpocock-skills:writing-for-agents`

## Commit dělá jen orchestrátor

Sezení, se kterým mluví uživatel, je jediné, kdo commituje a pushuje.
Agenti (programátor, tester) změny nechávají v pracovním stromu a zprávu
commitu jen navrhují; projektový hook jim `git commit`/`git push` zamítne
(`.claude/hooks/orchestrator-only-git.sh`, role z `scripts/agent.sh`).

## Brána

Před každým commitem ze složky pluginu, všechny čtyři zelené:

```sh
claude plugin validate .
claude plugin test .
scripts/vsa-check.sh
npx -y -p typescript tsc -p . --noEmit
```

Pluginy mezi sebou nesdílí kód ani soubory: plugin musí jít ze složky vyjmout
a fungovat sám. Společné jsou jen tyhle návody a šablona.
