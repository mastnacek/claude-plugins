# cc-prompt-translate-czk

Plugin pro Claude Code: prompt odchází do modelu anglicky, finální odpověď se
vykreslí česky. Uložená zpráva zůstává anglicky, takže kontext modelu se nikdy
nemíchá. Port pi-prompt-translate-czk; uživatelský popis je v `README.md`.

Struktura je čitelná ze stromu. Každý řez má vlastní `CLAUDE.md` s kontraktem
a tabulkou **„Nepatří sem“** — než do řezu sáhneš, přečti ji. Je kratší
a přesnější než tenhle soubor.

## Příkazy

```sh
claude plugin validate .        # validátor enginu: atomy, on/$, registrace
claude plugin test .            # všechny *.test.ts (i ve složkách řezů)
scripts/vsa-check.sh            # hranice řezů (viz níž)
npx -y -p typescript tsc -p . --noEmit   # typy; chyby v *.test.ts jsou starší dluh
```

**Brána před commitem: všechny čtyři.** Typy hooků musí být čisté, testy zelené,
`vsa-check` OK.

Vývoj naživo: `claude plugin disable prompt-translate@cc-prompt-translate-czk`
a pak `claude --plugin-dir .` (hot reload). **Nikdy obě kopie najednou** —
každý prompt by se přeložil dvakrát. Vývojová kopie má vlastní `$.store`, takže
nevidí překlady uložené instalovanou kopií; to není chyba.

`.claude/prompt-translate.json` je lokální nastavení — necommitovat (je
v `.gitignore`).

## Architektura: vertical slices + hluboké moduly

```
hooks/
  register.tsx                  kořen kompozice — jen zapojí řezy
  pipeline.test.ts              end-to-end přes všechny řezy
  features/<řez>/               jedna funkce = jedna složka (hooky, logika, testy, CLAUDE.md)
    prompt-to-english/  answer-to-target/  question-dialog/
    command-arguments/  indicator/         settings-command/
  shared/                       jádro, které řezy používají; nezná je
    translation/                HLUBOKÝ modul: translate(), detectLanguageOrCode()
    config.ts credit.ts log.ts progress.ts session-archive.ts state.ts …
types/index.d.ts                kontrakt $.state — jediné místo, kde se řezy „potkají“
```

Pravidla (hlídá `scripts/vsa-check.sh`):

1. **Řez neimportuje z jiného řezu.** Řez musí jít smazat jako složka.
   Konstantu, kterou potřebují dva řezy, radši zduplikuj (viz `OWN_COMMAND`
   v `command-arguments`) — duplicita je levnější než špatná abstrakce.
2. **Závislosti míří dolů:** `register.tsx → features → shared`. `shared/`
   nezná řezy ani kořen.
3. **Řezy spolu mluví jen přes `$.state`**, ne voláním: prompt nastaví
   `pending` a odpověď ho přečte; překlad nastaví `translating` a indikátor ho
   kreslí. Kdo hodnotu píše a kdo čte, stojí v `CLAUDE.md` řezu (Kontrakt).
4. **Vnitřnosti hlubokého modulu jsou soukromé:** zvenku jen
   `translation/translate.ts` a `translation/detect.ts`; `protect.ts`
   a `prompts.ts` ne.
5. **Síť (`$.http.fetch`) jen v `shared/`.**

### Pasti enginu, které tvar určují

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
- **Vydání:** zvedni `version` v `.claude-plugin/plugin.json`, push na `main`,
  pak `claude plugin marketplace update cc-prompt-translate-czk`
  a `claude plugin update prompt-translate@cc-prompt-translate-czk`. Bez
  zvednuté verze update nic nestáhne.
