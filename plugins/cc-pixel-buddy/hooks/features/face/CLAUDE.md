# face

Postavička na obrazovce: proužek nad promptem (vždy) a panel (na `/buddy open`).

```
╭──────────────────────────────────────────────╮
│ [•…•] 🤔 přemýšlí · dnes 3 tahů              │   3 řádky, od ~60 sloupců
╰──────────────────────────────────────────────╯
```

Hlavička z box znaků (`art.ts`): `mini` (5 znaků v proužku) a `big` (13 × 5 v panelu). Barva podle nálady
(`success` / `warning` / `claude` / dim), hláška barvou svého významu. Nic k řeči → hlavička, nálada, tahy dne.

## Kontrakt

- Čte: `mood`, `hint`, `stats`, `muted`. Nepíše nic.
- `ui.render AbovePrompt`: ustupuje průzkumu (`hasSurvey`) a před první náladou nekreslí nic (`next(e)`).
- `ui.render Pane` s `requestId: "buddy"`: panel otevírá `command`.

## Nepatří sem

| věc | kam |
|---|---|
| odvození nálady | `mood` |
| otevření / zavření panelu, mute | `command` |
| text hlášek | `hints` |

## Pasti

- `statRows` je záměrně ve dvou kopiích (zde a ve `command/parse.ts`); do `shared/` až při třetím použití.
- Proužek je jeden `Text` s `wrap="truncate-end"`: v úzkém okně se useknou hlášky, ne zalomí rámeček.
- Řádky dlouhé víc než pane `bodyColumns` zalamuje engine.
