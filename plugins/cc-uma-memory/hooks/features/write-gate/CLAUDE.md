# Slice: write-gate

## Proč existuje

Paměť UMA je sdílená mezi sezeními i nástroji; zápis, který si model vymyslí,
v ní zůstane. Řez ukáže uživateli každý zápis předem a zavře obchvaty (přímý zápis
do souborů úložiště, bash s `uma write`). Kdyby zmizel, zápisy řeší už jen
oprávnění MCP nástrojů v Claude Code a obchvaty jsou otevřené.

## Co dělá

- `tool.call` (jeden hook pro všechny nástroje, `register.ts`):
  - `mcp__plugin_cc-uma-memory_uma__uma_write` / `…__uma_supersede` — `$.ui.ask` s náhledem (typ, titulek, scope, tělo zkrácené na 600 znaků, u supersede ID) a volbami „✅ Zapsat“ / „❌ Zamítnout“ (u bashe „🚀 Spustit“ / „❌ Zamítnout“), hlavička „🧠 Paměť UMA“; emoji bez variačního selektoru, ať je terminál kreslí dvě kolonky. Zamítnutí, text pod „Other“ i nemožnost se zeptat (bez UI) jsou `{ deny }` s důvodem pro model.
  - `Write` / `Edit` / `NotebookEdit` do úložiště (`.uma/`, globální úložiště) — `{ deny }` vždy, v obou režimech; i přes symlink (`$.fs.stat(…, { resolve: true }).realPath`, u neexistujícího souboru jeho složka).
  - `Bash`, který by měnil paměť — stejný dialog s příkazem; zamítnutí nebo bez UI = deny.
- `bypass.ts` — čistá logika portovaná z pi (`approval_gate.ts`): `isUmaMemoryFilePath`, `isBypassingBashCommand` (rozpad na segmenty, `subcommandMutatesMemory`, rozbalení `bash -c` / `cmd /c` / `powershell -Command` a wrapperů `sudo` `env`…, přesměrování, mutující utility).
- `dialog.ts` — texty náhledu, názvy nástrojů, výklad odpovědi.
- Režim `settings.writeGate` (`ask` výchozí | `off`): `off` vypne jen dialog (u nástrojů i bashe); `Write`/`Edit` do úložiště zůstávají zakázané.

## Kontrakt

- **Čte:** `settings` (`writeGate`).
- **Nepíše** nic do `$.state`.
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
- Po „✅ Zapsat“ se Claude Code může zeptat ještě jednou (oprávnění MCP nástroje); přidej `mcp__plugin_cc-uma-memory_uma__uma_write` a `…__uma_supersede` do `permissions.allow`, chceš-li dotaz jen jeden.
- `$.ui.ask` v režimu `-p` selže → zápis se zamítne (správně: nemá kdo schválit).
- Ve stávajícím sezení bez připojeného MCP serveru typy `claude-code-mcp` `uma_*` neznají; kód s nimi nepracuje typově (`e as Record<string, unknown>`).
