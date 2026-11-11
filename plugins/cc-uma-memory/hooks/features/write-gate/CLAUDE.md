# Slice: write-gate

## Proč existuje

Paměť UMA je sdílená mezi sezeními i nástroji; zápis, který si model vymyslí,
v ní zůstane. Řez ukáže uživateli každý zápis předem a zavře obchvaty (přímý zápis
do souborů úložiště, bash s `uma write`). Kdyby zmizel, zápisy řeší už jen
oprávnění MCP nástrojů v Claude Code a obchvaty jsou otevřené.

## Co dělá

- `tool.call` (jeden hook pro všechny nástroje, `register.ts`):
  - `mcp__plugin_cc-uma-memory_uma__uma_write` / `…__uma_supersede` — **dialog po krocích** přes `$.ui.ask` (hlavička „🧠 Paměť UMA“), pi okno rozložené do textu. Hlavní dialog: náhled jako v pi (hlavička „🧠 UMA • Návrh zápisu do paměti“, čipy typ/rozsah/tagy, 📌 Název, 📄 Obsah 8 řádků + „… (+N řádků)“; u supersede „🔁“ s ID) a čtyři volby: „✅ Schválit a uložit do paměti“ · „✏️ Upravit (název, obsah, tagy, celý text)“ · „🔄 Přepnout rozsah ➔ 🌐 globální“ (nebo „➔ 📁 <projekt>“) · „❌ Zamítnout a zahodit“. „Upravit“ otevře menu Název / Obsah / Tagy / 📜 Celý text; pole ukáže aktuální hodnotu a nová se píše pod „Type something“ (tagy čárkou; „↩ Zpět beze změny“ nic nemění), celý text se ukáže v otázce. Po každé změně zpět do hlavního dialogu s novým náhledem. Schválení pokračuje s **upravenými** `title`/`body`/`tags`/`scope`; ostatní pole volání (`type`, `since`, `oldId`…) zůstávají. Zamítnutí je `{ deny }` s důvodem pro model, text napsaný v hlavním dialogu je zamítnutí s tímto textem jako důvodem. Zavřený dialog / `-p` (nemá kdo odpovědět) = deny; zavřené menu úprav = zpět do hlavního dialogu.
  - `Write` / `Edit` / `NotebookEdit` do úložiště (`.uma/`, globální úložiště) — `{ deny }` vždy, v obou režimech; i přes symlink (`$.fs.stat(…, { resolve: true }).realPath`, u neexistujícího souboru jeho složka).
  - `Bash`, který by měnil paměť — `$.ui.ask` s hlavičkou `🛡️ UMA imunitní interceptor` a volbami `Ano, pokračovat` / `Ne, zablokovat` (texty imunního dialogu z pi); zamítnutí nebo bez UI = deny.
- `bypass.ts` — čistá logika portovaná z pi (`approval_gate.ts`): `isUmaMemoryFilePath`, `isBypassingBashCommand` (rozpad na segmenty, `subcommandMutatesMemory`, rozbalení `bash -c` / `cmd /c` / `powershell -Command` a wrapperů `sudo` `env`…, přesměrování, mutující utility).
- `proposal.ts` — čistá část dialogu: model (`Proposal`), texty z pi, `previewOf`, štítky voleb, `withField`, `approvedInput`.
- `dialog.ts` — texty bash dialogu, názvy nástrojů, důvody zamítnutí, výklad odpovědi.
- Režim `settings.writeGate` (`ask` výchozí | `off`): `off` vypne jen dialog (u nástrojů i bashe); `Write`/`Edit` do úložiště zůstávají zakázané.

## Kontrakt

- **Čte:** `settings` (`writeGate`).
- **Nepíše** nic do `$.state`; stav dialogu je lokální proměnná smyčky v `review`.
- **Soubory:** nic nezapisuje; `$.fs.stat` jen čte.

## Nepatří sem

| co | kam patří |
|---|---|
| přepínač `/uma write-gate` | `uma-command` |
| samotné nástroje `uma_*` | MCP server `uma` (Rust jádro) |
| vkládání vzpomínek do promptu | `recall` |
| druhý dotaz Claude Code na oprávnění MCP nástroje | nastavení oprávnění uživatele (`permissions.allow`) |

## Pasti

- **Symlinky u bashe nejdou.** U `Write`/`Edit` se cesta rozřeší přes `$.fs.stat`, u bashe ne (`ln -s .uma m; echo x > m/f.md` projde). `bypass.ts` soudí podle pravopisu cesty; pi používal `realpath`, tady není. Také `cd .uma && echo x > f.md` (relativní cíl po `cd`) projde.
- Tokenizér není shell: proměnné (`$STORE/x`), `eval`, base64 a skripty ve vlastních souborech projdou. Brána chrání před omylem modelu, ne před škodlivým.
- `tool.call` bez matcheru smí být v pluginu jen jednou, a názvy MCP nástrojů nejsou v typech matcheru, dokud server nebyl při uložení modulu připojený — proto jeden hook s větvením podle `e.tool`.
- Hook selhání: pro `uma_*` se selhání bere jako zamítnutí (`.catch`), pro ostatní nástroje se bere jako průchod — jinak by chyba pluginu zablokovala každý `Write`.
- Po schválení se Claude Code může zeptat ještě jednou (oprávnění MCP nástroje); přidej `mcp__plugin_cc-uma-memory_uma__uma_write` a `…__uma_supersede` do `permissions.allow`, chceš-li dotaz jen jeden.
- **Proč `$.ui.ask` a ne pás/panel s tlačítky (zkoušeno živě).** Hook `tool.call` má rozpočet 10 s *vlastního* času (`HookBudget.ms`); čas běží, i když hook čeká na vlastní Promise, a stojí jen během volání `$` / `next`. Čekání na `onPress` z pásu `AbovePrompt` (nebo z panelu) tedy skončí po 10 s hláškami `hook failed closed … tool.call` a `hook overran`. `$.ui.ask` je volání `$`, rozpočet při něm stojí, takže uživatel může přemýšlet libovolně dlouho. Proto se nikdy nečeká na událost z UI Promisem uvnitř hooku. (Panel navíc potřeboval 144 sloupců, pás klávesy od uživatele.)
- **Omezení `$.ui.ask`:** 2–4 volby a víceřádková otázka bez zalamování; žádné klávesy Enter/e/b/t/v/s ani vstupní pole. Text se píše pod „Type something“; menu úprav má čtyři volby, takže „Zpět“ je zavření dialogu; v dialogu pole je druhá volba „✅ Hotovo“ (ask chce aspoň dvě) a znamená totéž co „↩ Zpět beze změny“.
- Validátor: `$` smí jen do funkcí deklarovaných na vrchu souboru, proto jsou helpery (`ask`, `editMenu`, `review`) mimo `registerWriteGate`.
- `$.ui.ask` v režimu `-p` selže → zápis se zamítne (správně: nemá kdo schválit).
- Ve stávajícím sezení bez připojeného MCP serveru typy `claude-code-mcp` `uma_*` neznají; kód s nimi nepracuje typově (`e as Record<string, unknown>`).
- **Upravený návrh nejde přes `next`.** Auto mode posuzuje vstup nástroje před hooky; přepsaný vstup zamítne („a hook changed this call's input after auto mode reviewed it“). Po úpravě proto hook volá nástroj znovu přes `$.tool.call` (klasifikátor posoudí nový vstup; vlastní hook se na něm přeskočí jako re-entry) a k výsledku přidá `context` s tím, co uživatel změnil. Bez úpravy jde původní volání `next(e)`.
- **Dialog vrací popisek bez variačního selektoru** (U+FE0F: „✏️“ přijde jako „✏“). Odpovědi se proto čtou přes `optionOf` (`dialog.ts`), ne `===`.
