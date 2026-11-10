# Architektura pluginu

Jak postavit kód hooků: řezy (vertical slices), hluboké moduly a pasti enginu,
na které narazí každý nový řez. API enginu samotné (`$`, události, `ui.render`)
je ve skillu `plugin-authoring`.

Kostra každého pluginu:

```
hooks/
  register.tsx        kořen kompozice — jen zapojí řezy
  features/<řez>/     jedna funkce = jedna složka (hooky, logika, testy, CLAUDE.md)
  shared/             technika bez obchodní logiky a hluboké moduly; nezná řezy
types/index.d.ts      kontrakt $.state — jediné místo, kde se řezy potkají
```

Hranice hlídá `scripts/vsa-check.sh` pluginu: řez neimportuje z jiného řezu,
`shared/` nezná řezy ani kořen, `$.http.fetch` jen ve `shared/`. Řezy spolu
mluví jen přes `$.state` (jeden píše, druhý čte; kdo co, stojí v `CLAUDE.md`
řezu).

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
  pluginu jde modelu do kontextu** — vzor obchvatu: `plugins/prompt-translate/hooks/features/settings-command`.
- **Mění-li se tvar hodnoty v `$.state`, změň `shape` atomu** (`"config-1"` →
  `"config-2"`) ve všech souborech, které atom deklarují: po reloadu zůstává
  stará hodnota a nový kód by ji četl jako novou.
- **`tsc` hlásí `Cannot find module 'claude-code'`** → chybí
  `.claude-plugin/types/` (je v `.gitignore`, vzniká při načtení enginem).
  Načti plugin jednou: `claude --plugin-dir plugins/<plugin>`.

## Kdy nový řez, kdy rozšíření, kdy shared

| situace | kam |
|---|---|
| nová funkce, kterou by šlo samostatně vypnout nebo smazat | **nový řez** |
| jiná událost enginu / jiný kus UI se samostatným smyslem | **nový řez** |
| stejná funkce, nový parametr nebo nastavení | **rozšíření** existujícího řezu |
| stejná funkce, jiná implementace (jiný backend modelu) | rozšíření — uvnitř hlubokého modulu ve `shared/` |
| technická věc bez obchodní logiky (HTTP, kurz, log, úložiště) | `shared/` |
| logika, kterou potřebují 2 řezy | **zduplikuj**; do `shared/` až při třetím (Rule of Three) a jen když se mají měnit společně |

Řez pod ~50 řádků bez vlastního stavu je podezřelý — nejspíš je to rozšíření.
Řez nad ~8 soubory nebo 600 řádků zvaž rozdělit na pod-řezy.

## Hluboký, nebo mělký modul

**Hluboký modul** = malé rozhraní, hodně schované práce. `plugins/prompt-translate/hooks/shared/translation`
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
