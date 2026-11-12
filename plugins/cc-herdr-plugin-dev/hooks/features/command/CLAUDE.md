# Slice: command

## Proč existuje

Člověk chce totéž co model, z promptu: `/herdr-plugin scaffold|validate|docs`. Bez řezu zůstanou jen nástroje pro model.

## Co dělá

- `startCommand` (kořen při `session.start`) — `$.command.register` příkazu `herdr-plugin`.
- `command.run {herdr-plugin}` — `run.runCommand`: `scaffold <lang> [dir] [id]` (výchozí rust, `./my-herdr-plugin`, `custom.herdr-tool`),
  `validate [path]` (výchozí `.`), `docs`, jinak nápověda. Modelu vrací **jeden řádek**; celý výstup (`HerdrOutput`) uloží do `commandOutputs`.
- `ui.render {CommandOutput}` — vykreslí uložený výstup v rámečku `🧩 Herdr · <název>` (barva rámečku podle stavu).
- `prompt.autocomplete` — doplňuje podpříkazy a jazyk.

## Kontrakt

- **Píše i čte:** `commandOutputs` ve `$.state` (nejvýš 20 položek, klíč = řádek pro model, `shape: "output-1"`).
- Používá `shared/actions` (zápis kostry, čtení manifestu), stejně jako nástroje.

## Nepatří sem

| co | kam patří |
|---|---|
| nástroje pro model | `scaffold`, `manifest` |
| obsah kostry, pravidla manifestu | `shared/scaffold`, `shared/manifest` |

## Pasti

- Text příkazu jde modelu do kontextu: proto jeden řádek a data v `$.state`.
- Atom `commandOutputs` se deklaruje v každém souboru, který ho čte nebo zapisuje (zde jen `register.tsx`).
- Zadáš-li `validate` bez cesty, hledá se `./herdr-plugin.toml` vůči pracovní složce enginu.
