# mood

Nálada postavičky podle práce. Pravidla jsou tabulka (`FACE_RULES` v `rules.ts`), ne rozvětvený kód:
první splněný řádek vyhrává.

| nálada | kdy |
|---|---|
| 😴 spí | žádná aktivita ≥ 10 min (minutový `$.clock.every`), nikdy během tahu |
| 🤔 přemýšlí | běží tah hlavní smyčky |
| 🎉 slaví | prošel `git commit` / `git push`; mizí při dalším tahu |
| 😰 ustaraný | 3 a víc chyb nástrojů po sobě |
| 😊 spokojený | poslední test / build prošel |
| 🙂 výchozí | jinak |

## Kontrakt

- Píše: `mood` (celý `MoodState`: tvář, emoji, popisek, barva + paměť — řada chyb, poslední test, party, working, asleep).
- Čte: nic. Události dostává od kořene: `startMood`, `moodTurnStart`, `moodTurnEnd`, `moodCall`
  (událost bez matcheru smí být hooknutá jednou, proto je hookuje kořen).
- `LOOK` (emoji, český popisek, barva) žije tady; ostatní řezy čtou hotové hodnoty z `mood`.

## Nepatří sem

| věc | kam |
|---|---|
| kreslení hlavičky, barvy rámečku | `face` |
| hlášky (3× stejná chyba…) | `hints` |
| počítání za den | `stats` |
| rozpoznání příkazu (commit, test) | `shared/classify.ts` |

## Pasti

- Poslední test, který selhal, ruší 😊 (zpět na 🙂); řada chyb se nuluje jakýmkoli úspěšným voláním.
- `lastAt` je proměnná modulu: po hot reloadu se spánek odměřuje znovu.
- Tahy subagentů nehýbou náladou (`agentId`), jejich volání nástrojů ano.
