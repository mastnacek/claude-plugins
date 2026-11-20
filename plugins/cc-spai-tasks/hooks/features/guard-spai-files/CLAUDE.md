# Slice: guard-spai-files

## Proč existuje

Záznamy SPAI (`docs/spai/**.md`, `.index.json`) zapisuje a maže jen binárka `spai`: hlídá ID, duplicity a index.
Agent by je rád upravil rukou; řez zápis odmítne a řekne, co použít místo toho.

## Co dělá

- `tool.call` pro `Write`, `Edit`, `NotebookEdit`: cesta se segmentem `docs/spai/` (i `.pi/spai/`), končí `.md` nebo je `.index.json` → `{ deny }`.
- `tool.call` pro `Bash`: jen zjevný zápis — přesměrování `>`/`>>`, `tee`, `sed -i`, `cp`/`mv` s cílem v záznamu. Čtení projde.
- `tool.call` pro `Bash`: i mazání — `rm`, `git rm`, `del`, `erase`, `Remove-Item` (`ri`), `unlink` s cílem v záznamu → `{ deny }` s hláškou „Záznamy SPAI maže jen `spai delete` (skill spai).“
- `decide.ts` — čisté funkce `decide`, `isSpaiRecord`, `bashWritesRecord`, `bashDeletesRecord`.

## Kontrakt

- **Čte:** jen vstup volání nástroje. Nic v `$.state`, nic z disku.
- **Píše:** nic.

## Nepatří sem

| co | kam patří |
|---|---|
| zápis záznamů | binárka `spai` |
| `MultiEdit` | tento build enginu nástroj nezná (matcher neprojde `tsc`); `decide` ho umí, zapojit až ho typy mají |
| rozbor složitých shellových konstrukcí (`eval`, `$(…)`, skripty) | nikam — raději méně falešných zamítnutí |

## Pasti

- `\\` se bere doslova (Windows cesty), ne jako escape; cesty s mezerou musí být v uvozovkách.
- Velikost písmen se nerozlišuje, `/` i `\\` platí.
- Text v uvozovkách (`spai add --title 'x > docs/spai/a.md'`) není přesměrování.
- Mazání se hledá jen u známých příkazů; `rm -r docs/spai` (složka, ne soubor) a skripty projdou.
- Cesta se porovnává jen podle tvaru, bez cwd a symlinků.
