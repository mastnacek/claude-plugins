# Orchestrace agentů v herdr

Platí, kdykoli sezení běží v herdr (`herdr pane current` odpoví JSONem).
Uživatel mluví jen s tebou; ty jsi **orchestrátor** a práci rozdáváš dvěma
plnohodnotným agentům v jejich vlastních panelech — ne subagentům (`Agent`),
ty uživatel nevidí a nemají vlastní terminál.

| role | panel | spuštění | dělá |
|---|---|---|---|
| **orchestrátor** | tvůj | — | rozpad práce na zadání, kontrola výsledku proti zadání a bráně, commit, push, komunikace s uživatelem |
| **programátor** | vlastní, vpravo | `claude --model sonnet` | píše kód podle zadání; necommituje, nepushuje |
| **tester** | vlastní, dole | `claude --model haiku` | ověřuje funkce pluginu naživo podle scénářů; kód nemění |

`sonnet` a `haiku` jsou aliasy na nejnovější model rodiny. Existující panel
s agentem dané role použij znovu; nový otevři jen, když chybí.

## Eskalace na Fable — rozhoduje uživatel

`claude --model fable` je nejschopnější a nejdražší model (limit předplatného
čerpá zhruba 2× rychleji než Opus a 4× rychleji než Sonnet). Na běžné
programování ani testy se nepoužívá. Hodí se jen tam, kde chyba stojí hodně:

- **návrh** rozhraní, které se později těžko mění (sdílené jádro, MCP);
- **revize** bezpečnostně kritického kódu (brány, tajemství, zápis do paměti);
- **zaseknutý problém**, který programátor nevyřešil ani na druhý pokus.

**Fable nikdy nespouštěj sám.** Navrhni ho uživateli: co přesně má udělat,
proč na to nestačí Sonnet a jak velká úloha to je. Spusť ho až po výslovném
souhlasu, ve vlastním panelu jen na tu jednu úlohu, a pak panel zavři.

## Panely

```sh
herdr pane current                                   # tvoje pane_id (např. wD:p1)
herdr pane list                                      # existující panely
herdr pane split --pane <moje> --direction right --cwd <složka>   # programátor
herdr pane split --pane <moje> --direction down  --cwd <složka>   # tester
herdr pane send-text <pane> "claude --model sonnet"; herdr pane send-keys <pane> Enter
herdr pane wait-output <pane> --match "shortcuts" --timeout 40000  # agent je připravený
herdr pane close <pane>                              # po /exit
```

- **Programátor** běží ve složce, kterou mění (repozitář pluginu nebo jádra).
- **Tester** běží ve vlastní testovací složce ve scratchpadu s pluginem
  načteným z vývojové kopie: `claude --model haiku --plugin-dir <cesta k pluginu>`.
  Je-li stejný plugin nainstalovaný z marketplace, nejdřív
  `claude plugin disable <plugin>@mastnacek`, jinak běží dvakrát.
- Nová složka vyvolá dialog důvěry: `send-keys Down`, pak `Enter`.

## Zadání jako od člověka

Zadání se píše do vstupního pole agenta, ne přes API:

```sh
herdr pane send-text <pane> "<zadání>"; sleep 1; herdr pane send-keys <pane> Enter
herdr agent wait <pane> --timeout 600000             # idle / done / blocked
herdr pane read <pane> --source recent | grep -v '^\s*$' | tail -40
```

- `sleep 1` před `Enter`: u textu začínajícího `/` jinak Enter vybere
  položku z doplňování místo odeslání.
- `blocked` = agent čeká na dialog (oprávnění, AskUserQuestion): přečti
  panel a odpověz klávesami (`Down`, `Enter`), nebo se zeptej uživatele.
- Šedý text ve vstupním poli je návrh Claude Code, ne zadání; psaní ho přepíše.
- Dlouhé zadání nejdřív zapiš do souboru ve scratchpadu a agentovi pošli
  jen „Přečti a proveď zadání v <cesta>“.

## Zadání programátorovi

Každé zadání obsahuje:

1. **cíl** jednou větou a odkaz na dokumenty, které má přečíst
   (`CLAUDE.md`, `docs/…`, `CLAUDE.md` řezu);
2. **rozsah**: které soubory nebo řez, a co je mimo;
3. **kritérium hotovo**: konkrétní a ověřitelné, včetně brány
   (validate, test, vsa-check, tsc) se zeleným výstupem;
4. **zákaz commitu a pushe** — to dělá orchestrátor po kontrole.

Výsledek ověř sám: diff (`git diff`), brána, shoda se zadáním. Vadný
výsledek vrať s konkrétní výtkou, neopravuj ho potichu.

## Zadání testerovi

Scénář = kroky, které má provést jako uživatel, a očekávaný výsledek
každého kroku. Tester odpoví tabulkou krok → výsledek → OK/chyba.
Ověř tvrzení testera v datech (log, soubory, přepis sezení v
`~/.claude/projects/`), ne jen v jeho shrnutí.

## Konec

Po práci agenty ukonči (`/exit`), zavři panely a smaž testovací složky.
