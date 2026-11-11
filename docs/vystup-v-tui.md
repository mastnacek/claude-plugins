# Výstup pluginu v TUI

Cíl: na první pohled poznat, **co vypsal plugin** a co je běžná odpověď modelu.
Text modelu je holý markdown; výstup pluginu proto nikdy nevypadá jako holý text.

## Pravidla

- **Rámeček.** Víceřádkový výstup příkazu (`CommandOutput`), dialog, panel i pás nad
  promptem kreslí obsah v `Box` s `borderStyle` (`round`) a barvou rámečku podle
  pluginu. Celý výstup je v jednom rámečku, ne jen nadpis.
- **Hlavička.** První řádek uvnitř rámečku: emoji pluginu + název akce
  (`🧠 UMA · hledání „Database“ · 1 výsledek`), tučně.
- **Pole barevně a s ikonou.** Popisky polí (`ID`, `Tags`, `Scope`, `Type`, `Score`…)
  odlišené barvou nebo dim, hodnoty v jiné barvě; typ/rozsah jako barevný štítek
  (`[task]`, `[project:…]`); emoji tam, kde zkracuje čtení (`🆔`, `🏷️`, `📁`, `⚖`).
- **Barvy z motivu**, ne natvrdo RGB: jmenované barvy enginu (`success`, `warning`,
  `error`, `permission`…), aby to sedělo ve světlém i tmavém motivu.
- **Stav barvou:** úspěch zeleně, varování žlutě, chyba/zamítnutí červeně.
- **Barva podle významu.** Texty se rozlišují: čistá funkce pozná význam řádku/hodnoty
  (chyba, varování, úspěch, ID, cesta, číslo, příkaz, prázdný výsledek) a podle něj
  zvolí barvu — primárně z polí dat (stav, typ, závažnost), z textu (CZ i EN) jen bez pole.
- **Model čte holý text.** Kreslený strom je jen pro člověka; `text`/`context`
  výsledku příkazu zůstává čistý text bez ANSI a rámečků (to, co jde do přepisu
  modelu, se nemění kvůli vzhledu).
- **Prefix pluginu nepiš** — engine ho přidá sám (`docs/architektura.md` § Pasti).

## Vzor

Jak má vypadat výstup (`/uma search Database`):

```
╭─ 🧠 UMA · hledání „Database“ · 1 výsledek ─────────────────────╮
│                                                                │
│  1. Prověřit: falešné poplachy brány write-gate u sed/cp …     │
│     📋 task   📁 project:claude-plugins   ⚖ 0.016              │
│     🆔 01M744E20JKEEJRA61M6Z11NBV                              │
│     🏷️  cc-uma-memory · write-gate · k-revizi                  │
│                                                                │
╰────────────────────────────────────────────────────────────────╯
```

Rámeček v barvě pluginu, hlavička tučně, štítek typu barevně, popisky dim.
Chyba: rámeček `error`, `❌ …`.

Tři vrstvy:

1. `command.run` vrátí `{ text }` — holý text pro model a přepis.
2. Strukturovaná data (`{ title, items[] }`) jdou do `$.state`; vyrábí je **čistá
   funkce v řezu z `--json` výstupu motoru** (ne z parsovaného textu), s testem.
3. `ui.render` na `CommandOutput` kreslí strom; bez dat `return next(e)` (engine
   nakreslí holý text — nikdy prázdný rámeček).

```tsx
on("ui.render", { component: "CommandOutput" }, async ($, e, next) => {
  if (e.command !== "uma") return next(e);
  const out = read($, commandOutputsAtom)[e.text];
  if (!out) return next(e);
  const { Box, Text } = $.ui.resolve(e);
  return (
    <Box borderStyle="round" borderColor="claude" flexDirection="column" paddingX={1}>
      <Text bold>🧠 UMA · {out.title}</Text>
      {out.items.map((f, i) => (
        <Box flexDirection="column" marginTop={1}>
          <Text>{i + 1}. {f.title}</Text>
          <Text>   <Text color={typeColor(f.type)}>📋 {f.type}</Text>  <Text dimColor>📁 {f.scope}</Text></Text>
          <Text dimColor>   🆔 {f.id}</Text>
          <Text dimColor>   🏷️  {f.tags.join(" · ")}</Text>
        </Box>
      ))}
    </Box>
  );
});
```

Dlouhé řádky nezalamuj ručně (`Text wrap`), šířku nech na rámečku.

## Jak

- Výstup příkazu: `command.run` vrátí `{ text }` (pro model) a hook
  `on('ui.render', { component: 'CommandOutput' }, …)` kreslí místo řádku vlastní
  strom (`$.ui.resolve(e)` → `Box`, `Text`); vzor: `cc-uma-memory` řez `uma-command`.
- Dialogy `$.ui.ask`: emoji v hlavičce a volbách (pozor na U+FE0F, viz `optionOf`).
- API prvků (`Box` props, barvy): skill `plugin-authoring`, typy `'CommandOutput'`, `Box: {`.
