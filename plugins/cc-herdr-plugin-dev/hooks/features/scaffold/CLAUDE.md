# Slice: scaffold

## Proč existuje

Model dostane hotovou, platnou kostru herdr pluginu místo psaní manifestu z paměti. Bez řezu zůstane jen `/herdr-plugin scaffold` (řez `command`).

## Co dělá

- `startScaffold` (kořen při `session.start`) — `$.tool.register` nástroje **`herdr_scaffold_plugin`** `{ targetDir, id, name, language, description? }`.
- `tool.call {herdr_scaffold_plugin}` (plné jméno `mcp__cc-herdr-plugin-dev__herdr_scaffold_plugin`) — `shared/actions.scaffoldPlugin`:
  zkontroluje vstup, odmítne přepsat existující `herdr-plugin.toml`, zapíše soubory přes `$.fs.write`, vrátí seznam souborů a další krok (`herdr plugin link .`).

## Kontrakt

- **Čte:** vstup nástroje, `$.fs.exists`. **Píše:** soubory kostry. Nic ve `$.state`.

## Nepatří sem

| co | kam patří |
|---|---|
| obsah souborů kostry | `shared/scaffold` |
| kontrola manifestu | `manifest` / `shared/manifest` |
| `/herdr-plugin scaffold` | `command` |

## Pasti

- `name` jde do TOML, TS, Rustu i shellu: escapuje se (`JSON.stringify`, shell apostrofy), test s uvozovkami a zpětným lomítkem je v `shared/manifest.test.ts`.
- Plné jméno nástroje nese prefix pluginu; hook se vybírá regexem `/(^|__)herdr_scaffold_plugin$/`.
