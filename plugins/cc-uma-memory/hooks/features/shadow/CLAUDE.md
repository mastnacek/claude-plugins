# Slice: shadow

## Proč existuje

Co se z práce dá zapamatovat, model nezapíše sám od sebe: opravy od uživatele,
pády, které se podařilo odstranit, nové závislosti. Stínový pracovník (port
`slices/shadow` z pi) takové okamžiky sbírá a **navrhuje** je jako koncepty
v `.uma/.staging/`; do paměti jdou až po souhlasu člověka v `/uma review`
(`staging`). Kdyby zmizel, koncepty by vznikaly jen z opakovaných příkazů
(`muscle-synthesis`) a nikdo by nesbíral opravy.

## Co dělá

Vše přes `uma staging distill --trigger … --context … --judge off|jev --json`
(`$.process.run`, cwd sezení, 30 s), spuštěné `$.clock.after(0, …)` **po**
odpovědi hooku: tah nečeká, nic se neptá a nic nezobrazuje (počet konceptů je štítek ` 📝N` ze `staging`).

| okamžik | událost Claude Code | spouštěč |
|---|---|---|
| `cargo test/build`, `npm test`, `npm run build`, `pytest`, `go test`, `tsc` skončil chybou, pak (do 5 min) prošel **a mezitím se změnil aspoň jeden netestovací soubor** (`Edit`/`Write`, nebo `sed -i`/`perl -i`/`tee`/`>` v Bashi) | `tool.call {tool: "Bash"}` — výsledek z `next(e)` (`isError`, `text`); úpravy z `tool.call {tool: ["Write","Edit"]}` | `compiler_recovery` |
| změna `Cargo.toml` / `package.json` (`Write` s „dependencies“, jakýkoli neprázdný `Edit`) | `tool.call {tool: ["Write","Edit"]}`, po úspěšném výsledku | `dependency_change` |
| zpráva uživatele opravuje agenta (markery cs/en, nejvýš 300 znaků, po aspoň jedné odpovědi asistenta, identické opakování se přeskočí; pokyn k operaci — začíná slovesem „enable/add/zapni/přidej…“ nebo odkazuje na příkaz — oprava není) | `prompt.submit {text: /\S/}` (jen `composer`/`bridge`/`sdk`, ne příkaz ani meta) | `user_correction` |

- `policy.ts` — čistá logika z pi: `isCommandFailure` („0 failed“ není pád), `isUserCorrection` (zadání úkolu není oprava), `afterBash`, `dependencyContext`, `distillArgv`.
- Režim `settings.shadow` (`on` výchozí jako v pi | `off` | `jev`): `on` = `--judge off` (heuristika, bez sítě; pi: `fastbrainJudge: off`), `jev` = soudí Jev přes OpenRouter (klíč čte motor sám).

## Kontrakt

- **Čte:** `settings` (`shadow`).
- **Píše:** `shadowState` — `{ failure: {command, output, at, edited[]}, lastCorrection }` (jediný zapisovatel).
- **Procesy:** jen `uma staging distill`.

## Nepatří sem

| co | kam patří |
|---|---|
| přepínač `/uma shadow` | `uma-command` |
| `/uma review`, štítek ` 📝N` | `staging` |
| koncepty z opakovaných příkazů | `muscle-synthesis` |
| SPAI → koncept (`spai_done`) | zahozeno: v Claude Code není SPAI nástroj |
| jakýkoli zápis do paměti | nikdy; jen koncepty |

## Pasti

- **Protějšky pi → Claude Code.** `tool_result` (bash/write/edit) nemá samostatnou událost; hook `tool.call` s matcherem volá `next(e)` a čte výsledek (`isError` při nenulovém exit kódu, `text` je výstup). `turn_end` + `getBranch` → `prompt.submit` a `$.session.messages()` (je tam dřívější asistent?). Zdroj pro překlad (`pi-prompt-translate-state`) pryč: prompt je originál, české markery sedí přímo.
- **Bare `prompt.submit` má `recall`**, proto matcher `{ text: /\S/ }` (regex na textu). Bare `tool.call` má `write-gate`; zde matcher na nástroj.
- Pi u `Edit` bere vždy; zde jen neprázdný `new_string`. Pi hlídá jen `Cargo.toml` a `package.json`; ostatní manifesty (pyproject, go.mod) se nesbírají.
- Prázdný/pád `uma` ztratí jeden koncept, nic dalšího. Hooky při chybě vrací výsledek nástroje beze změny.
- Stav selhání je v atomu, takže přežije reload; uplyne-li 5 minut, další zelený běh už obnovou není. Tvar `failure` se změnil (`edited`), proto `shape: "shadow-state-2"`; starou hodnotu bez `edited` čte kód jako „nic nezměněno“. Změní-li se tvar znovu, zvyš `shape`.
- **Obnova učí jen s opravou kódu.** Mezi pádem a zelenou musí jít změnit netestovací soubor (testové: `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.py`, `tests/`, `__tests__/`). Jen testy nebo žádná změna (zastaralé očekávání, flaky rerun) koncept nevytvoří. Změny vidí jen `Edit`/`Write` a zápisy shellem, které rozpozná `shellWrittenPaths` (`sed -i`, `perl -i`, `tee`, `>`/`>>`); jiný zápis (`git checkout`, `cargo fmt`) se nepozná a obnova mlčí. Kontext konceptu je chyba + „Fixed by changing: soubory“ + jen testovací/buildové části příkazů (`testPart`), nikdy příkaz úpravy; pi tuto slabinu má (každá červená→zelená smyčka je koncept).
- **Oprava vs. pokyn.** Pi 0.17.5 vylučuje jen zadání, které jmenuje nástroj (`TASK_DIRECTIVE`); „Enable uma memory globally instead of …; there is an uma command for this“ jím neprošlo a „instead of“ ho udělalo opravou. Proto navíc `OPERATION_REQUEST` (úvodní sloveso operace, „command for this“, „uma command“) — pokyn není oprava, ledaže nese explicitní ukazatel chyby („špatně“, „chyba“, „nepoužívej“, „takhle ne“, „wrong“, „incorrect“, „don't use“, „never use“ …; „instead of“ jím není): „Oprav to, je to špatně“ oprava je. Oprava začíná vlastním slovem („Ne“, „Špatně“, „Don't use“), ta slovesa v seznamu nejsou. Záznam překladového pluginu (`source` v pi) tu není: prompt je originál.
- Motor `distill` s `--judge off` vždy něco zařadí; `jev` může označit `durable: false` a nezařadit nic.
