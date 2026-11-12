# Slice: docs-gate

## Proč existuje

Model píše herdr pluginy z paměti a mýlí si pravidla manifestu i API Ratatui. Brána ho donutí nejdřív přečíst skill; kdyby řez zmizel,
úpravy zdrojáků v herdr projektu by nic nehlídalo.

## Co dělá

- Nemá start: `docsRead` je ve `$.state` sezení, takže nové sezení začíná zamčené (hodnota nenastavená) a reload plugin brány neodemkne zpět.
- `tool.call {Read, Skill, Edit, Write, MultiEdit, NotebookEdit}` (`gate.accessOf`):
  - Read souboru `.md` pod `/skills/herdr-plugin-dev/` nebo `/docs/herdr/`, nebo Skill `herdr-plugin-dev` / `<plugin>:herdr-plugin-dev` → `docsRead = true`;
  - úprava zdrojáku (`project.isSourcePath`) uvnitř herdr projektu (`findHerdrRoot`), dokud `docsRead` není `true` → `{ deny }` s pokynem, co přečíst;
  - cokoli jiného projde. Chyba = projde (fail-open).
- `prompt.compose` — přidá sekci `cc-herdr-plugin-dev:rules` (scope `session`), **jen když cwd sezení leží v herdr projektu**.

## Kontrakt

- **Čte a píše:** `docsRead` ve `$.state` (jen tento řez). Čte `$.session.cwd`, `$.fs.exists` (hledání `herdr-plugin.toml` nahoru, nejvýš 10 úrovní).

## Nepatří sem

| co | kam patří |
|---|---|
| limit řádků | `line-limit` |
| obsah dokumentace | `skills/herdr-plugin-dev/` (data) |
| rozpoznání herdr projektu, zdrojáků, docs cest | `shared/project` |

## Pasti

- Nepřidávej reset ve `session.start`: ten běží i po reloadu pluginu a brána by se uprostřed sezení znovu zamkla (ověřeno naživo).
- Hookuje se v kořeni jako první: zamítnutá úprava nesmí dojít k `line-limit`.
- Relativní `file_path` se čte proti cwd sezení; cesty se normalizují (`\` → `/`, malé písmeno disku).
- Cesta k docs musí obsahovat `/skills/herdr-plugin-dev/` — README tohoto pluginu bránu neotevře.
