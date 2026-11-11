# Slice: staging

## Proč existuje

Koncepty, které stínový pracovník a syntéza rutin uložily do `.uma/.staging/`,
musí někdo posoudit, než se stanou pamětí (invariant pi: souhlas je fail-closed,
nic se nezapisuje bez člověka). Port `slices/staging` z pi: `/uma review` a štítek.
Kdyby zmizel, koncepty by se hromadily a šly schválit jen ručním `uma staging approve` v bashi.

## Co dělá

- `/uma review` — načte `uma staging list --json` a každý koncept ukáže **stejným dialogem po krocích jako write-gate** (`$.ui.ask`, hlavička „🧠 Paměť UMA“, náhled `previewOf` z `shared/proposal`, první řádek „📝 UMA • Koncept i z N • spouštěč … • jistota …“): ✅ Schválit a uložit do paměti · ✏️ Upravit (název, obsah, celý text) · ⏭ Přeskočit (nechat na později) · ❌ Zamítnout a zahodit.
  - **Překlad jen pro zobrazení** stejně jako ve `write-gate` (`settings.lang`, `shared/translate`): náhled ukáže přeložený název a obsah, „📜 Celý text“ a úprava originál; `uma staging approve` dostane vždy anglický originál (nebo to, co uživatel napsal), ne překlad. Schválit = `uma staging approve <id>` (`--title=…` / `--body=…` jen u změněných polí, `=` kvůli hodnotě začínající pomlčkou); zamítnout = `uma staging discard <id>`. Chyba motoru → řádek logu, koncept zůstává, počítá se jako „selhalo“.
  - Zavřený dialog, `-p` (nemá kdo odpovědět) i text napsaný pod „Other“ **přeruší** kontrolu; nic dalšího se nerozhodne.
  - Výsledek: jeden řádek „Kontrola konceptů dokončena: N schváleno, N zahozeno, N ponecháno.“
- `/uma staging list` (výpis konceptů), `show <id>` (celý koncept), `discard <id>`; jiný argument = použití. Výstup jde jako data (`listResult`, `showResult`, `sentence`: položky s typem, rozsahem, ID, tagy, jistotou) do `commandOutputs` (kreslí `uma-command`), modelu jen první řádek; souhrn `/uma review` je věta v rámečku `success` / `warning` (přerušeno nebo selhání), chyby `error`. ID se kontroluje (ULID), aby se do argv nedostal přepínač.
- Štítek ` 📝N` pod promptem, když N > 0: počet `*.json` v `<cwd>/.uma/.staging/` (`$.fs.list`, bez procesu) se čte při startu sezení, po každém `/uma review` a `/uma staging …` a na konci každého odpovězeného tahu hlavního agenta (`turn.complete {reason: "answer"}`). Štítek kreslí `memory-guard`.
- `policy.ts` — čistá logika: argv volání, čtení výpisu, `proposalOf`, `questionOf`, data výstupů příkazů (`Result` = řádek pro model + `Out`).

## Kontrakt

- **Píše:** `stagingState` — `{ pending }` (jediný zapisovatel), `commandOutputs` (nejvýš 20 záznamů, sdílený s ostatními řezy).
- **Čte:** `settings` (`lang`).
- **Čtou ho:** `memory-guard` (`pending` → štítek).
- **Procesy:** `uma staging list|approve|discard` (`--json` u list; cwd sezení, 10 s).
- **Sdílené:** `shared/proposal` (model návrhu, texty, `previewOf`, `withField`, `optionOf`) — stejný kód jako dialog `write-gate`.

## Nepatří sem

| co | kam patří |
|---|---|
| vznik konceptů | `shadow`, `muscle-synthesis` |
| nápověda a doplňování `review` / `staging` | `uma-command` (ručně zrcadlí tento řez) |
| kreslení štítku | `memory-guard` |
| dialog před `uma staging approve\|discard` v bashi | `write-gate` (bash dál ptá; `/uma review` neptá podruhé — dialog je ten souhlas) |

## Pasti

- **Bez „Přepnout rozsah“ a bez úpravy tagů.** `uma staging approve` bere jen `--title` a `--body` (zjištěno z `--help`); tagy ani rozsah koncept přenese tak, jak je. Nabídnout je v dialogu by slibovalo něco, co se neuloží. Čtvrtá volba je proto „Přeskočit“ (pi: Tab/→). Chce-li se to změnit, patří to do motoru (`approve --tags/--scope`), ne sem.
- Štítek čte složku z cwd, ne z kořene gitu: v podsložce repa ukáže 0, i když koncepty čekají. `/uma review` a `/uma staging list` (motor) jsou přesné.
- Štítek se zpozdí: koncept, který stínový pracovník vytváří až po tahu, se objeví po dalším tahu / příkazu.
- `$.ui.ask`: 2–4 volby, text se píše pod „Type something“; popisky se vrací bez U+FE0F — čti přes `optionOf`.
- Pi překládal koncept do češtiny (`DisplayTranslation`) a rolovalo se v okně; zde je překlad v náhledu (8 řádků) a úplné anglické tělo v „📜 Celý text“. `/uma staging list|show` se **nepřekládá** (zadání říká jen `/uma review`).
- Dialog se ptá uvnitř `command.run`; `$.ui.ask` je volání `$`, takže rozpočet hooku při čekání stojí.
