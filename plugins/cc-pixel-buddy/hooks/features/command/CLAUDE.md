# command

`/buddy`: stav, panel, mute. Jen ukazuje a nastavuje — nic nezamítá, nic nespouští, vstupy nástrojů ani prompty nemění.

| příkaz | co dělá |
|---|---|
| `/buddy` | stav jedním rámečkem: nálada + statistiky dne |
| `/buddy open` | otevře panel (`$.ui.open`); když se neumístí, řekne to (rámeček `warning`) |
| `/buddy close` | zavře panel |
| `/buddy mute on\|off` | vypne / zapne hlášky; trvale v `$.store` (`muted`); postavička zůstává |

## Kontrakt

- Píše: `muted` (a zrcadlí do `$.store`), `cards` (výstupy příkazu jako data, nejvýš 20).
- Čte: `mood`, `stats`, `$.store` (`muted` při startu; cokoli jiného než `true` = nevypnuto).
- Model dostane jednořádkový text; rámeček kreslí `ui.render CommandOutput` z `cards` (klíč = ten text).
  Bez dat `next(e)`.

## Nepatří sem

| věc | kam |
|---|---|
| kreslení panelu | `face` |
| rozhodování, zda hlášku ukázat | `hints` / `face` (`muted` jen čte) |
| péče (feed / pet) | nebude — uživatel ji nechtěl |

## Pasti

- ID panelu `buddy` je v `command` i `face`; změň na obou místech.
- Text příkazu jde modelu do kontextu: žádné `\n`, žádné ANSI.
