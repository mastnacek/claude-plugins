# mastnacek/claude-plugins

Marketplace vlastních pluginů pro Claude Code. Jeden repozitář, každý plugin ve
vlastní složce `plugins/<plugin>/` s vlastním `CLAUDE.md`, `README.md`,
testy a verzí. Uživatel přidá marketplace jednou a instaluje pluginy zvlášť.

```
.claude-plugin/marketplace.json   seznam pluginů ("source": "./plugins/<plugin>")
plugins/<plugin>/                 jeden plugin = jedna složka, nic sdíleného mezi nimi
```

Pluginy: `prompt-translate` (překlad promptů do EN a odpovědí zpět do češtiny).

## Nový plugin

1. Složka `plugins/<plugin>/` s `.claude-plugin/plugin.json` (`name` = název
   složky, `version` od `0.1.0`, `homepage`/`repository` na tento repozitář).
2. Položka v `.claude-plugin/marketplace.json`:
   `{ "name": "<plugin>", "source": "./plugins/<plugin>", "description": "…" }`.
3. `claude plugin validate plugins/<plugin>` a `claude plugin validate .`
   (marketplace).
4. Pluginy mezi sebou nesdílí kód ani soubory — plugin musí jít ze složky
   vyjmout a fungovat sám. Společné jsou jen tyhle zásady.

## Pasti enginu (hooks moduly)

Na tyhle narazíš při každém novém řezu; validátor je odmítne, ale hláška
neřekne, jak to postavit správně:

- **Každá událost bez matcheru smí být hooknutá jen jednou na plugin.** Druhý
  `on("session.start", …)` = modul se nenačte. Společné události hookuje
  kořen a volá `startXxx($)` řezů. S matcherem (`{ component: "UserMessage" }`,
  `{ command: "…" }`) může každý řez svůj.
- **`on` i `$` smí jít jen do funkce volané jménem.** Smyčka přes pole řezů
  (`slice.register(on)`) neprojde — proto explicitní volání v kořeni.
- **Atom musí být deklarovaný v souboru, který ho čte nebo zapisuje.**
  Importovaný atom validátor nepřečte. Sdílí se klíč (literál), ne objekt.
- **`$.ui.log` je jeden řádek** (`\n` se kreslí jako `�`) a **text příkazu
  pluginu jde modelu do kontextu** — viz `settings-command`.

## Kdy nový řez, kdy rozšíření, kdy shared

| situace | kam |
|---|---|
| nová funkce, kterou by šlo samostatně vypnout nebo smazat | **nový řez** |
| jiná událost enginu / jiný kus UI se samostatným smyslem | **nový řez** |
| stejná funkce, nový parametr nebo nastavení | **rozšíření** existujícího řezu |
| stejná funkce, jiná implementace (jiný backend modelu) | rozšíření — uvnitř `shared/translation` |
| technická věc bez obchodní logiky (HTTP, kurz, log, úložiště) | `shared/` |
| logika, kterou potřebují 2 řezy | **zduplikuj**; do `shared/` až při třetím (Rule of Three) a jen když se mají měnit společně |

Řez pod ~50 řádků bez vlastního stavu je podezřelý — nejspíš je to rozšíření.
Řez nad ~8 soubory nebo 600 řádků zvaž rozdělit na pod-řezy.

## Hluboký, nebo mělký modul

**Hluboký modul** = malé rozhraní, hodně schované práce. `shared/translation`
je vzor: jedno `translate()` schovává maskování kódu a cest, dva backendy,
opakování, ořez reasoning, telemetrii a cenu; selhání nevyhazuje, vrací
originál s `degraded`. Řez neví nic z toho.

**Mělký modul** = rozhraní skoro tak velké jako implementace. Je v pořádku
jako **adaptér na hranici**: `register.tsx` řezu převádí události enginu na
volání logiky, kořen jen zapojuje. Není v pořádku jako **průchozí vrstva**,
která jen přeposílá (wrapper nad `translate()` se stejnými parametry →
smazat).

Jak rozhodnout:

- Volá to víc míst a skrývá to pravidla nebo pasti → **hluboký**, s co
  nejmenším rozhraním. Testuj přes rozhraní, ne přes vnitřnosti.
- Je to jedno místo napojení na engine → **mělký adaptér**; logiku z něj
  vytáhni do vedlejšího souboru řezu, jakmile má větve, které stojí za test
  (`indicator/badge.ts`, `prompt-to-english/history.ts`).
- Nedokážeš rozhraní popsat jednou větou bez „a taky“ → modul dělá dvě věci.

## Existující projekty

Ne každý projekt začíná od nuly. V `~/100_projects` už VSA s hlubokými
a mělkými moduly žije:

- `mozek_rust` — `src-tauri/src/features/<slice>/` + `shared/`, každá slice
  s `CLAUDE.md` („Nepatří sem“), invarianty vynucuje
  `.claude/hooks/vsa-guard.sh`, nová slice přes `/slice`, kód píše subagent
  `rust-slice-dev`.
- `spotube` — `lib/features/parental_control/` jako izolovaná slice nad cizím
  upstreamem; zásady v `docs/architektura.md` (malý projekt nebo cizí runtime
  → VSA vynech, hluboké moduly drž).

Při práci v takovém projektu: **nejdřív přečti strom a `CLAUDE.md` řezů,
pak zrcadli nejbližší existující řez** (členění souborů, styl komentářů, tvar
jeho `CLAUDE.md`). Vlastní konvence projektu mají přednost před tímhle
souborem. Kde VSA není a projekt je malý, nezaváděj ji kvůli principu —
stačí hluboké moduly.

## Git

- **Strukturální změna (nový řez, přesuny, refaktor) na vlastní větvi**
  (`refactor/…`, `feat/<řez>`). Do `main` se merguje až po bráně a se
  souhlasem uživatele; drobná oprava může jít rovnou na `main`.
- **Před riskantní operací `🔖 snapshot:` commit** — je zadarmo a vrací čas.
- **Jeden commit = jedna logická změna**, ideálně jeden řez. Přesuny souborů
  přes `git mv`, ať historie souboru přežije.
- Tvar zprávy jako v `mozek_rust` (skill `git-commit` tam):
  `<emoji> <typ>: <subject ≤72 znaků>`; u `fix`/`feat`/`refactor` povinné
  `## Kontext` (proč) a `## Poučení` (co neopakovat — test: ušetří to příště
  hodinu?). Emoji: 🐛 fix, ✨ feat, ♻️ refactor, 🔖 snapshot, 📝 docs,
  🔧 config, 📦 deps, 🔥 remove.
- Commituj až po bráně; tvrzení v těle („testy zelené“) jen z výstupu.
- **Vydání:** zvedni `version` v `plugins/<plugin>/.claude-plugin/plugin.json`
  a pushni na `main`. Marketplace má auto-update: Claude Code novou verzi
  stáhne po startu příštího sezení (načte ji `/reload-plugins`). Hned teď:
  `claude plugin marketplace update mastnacek` a
  `claude plugin update <plugin>@mastnacek`. **Bez zvednuté verze se nic
  nestáhne.** Verze se zvedá jen u pluginu, který se změnil.
- **Commit se týká jednoho pluginu**; subject začni jeho jménem, pokud to není
  zřejmé (`✨ feat(prompt-translate): …`).
