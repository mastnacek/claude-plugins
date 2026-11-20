# hints

Užitečné hlášky. Vždy jedna na obrazovce, každá se ukáže jednou a zmizí, když začne další tah.

| priorita | hláška | kdy |
|---|---|---|
| 1 | „3× stejná chyba — zkus jiný postup“ | stejné volání (Bash příkaz, jinak nástroj + cesta) selhalo 3× po sobě; jednou za řadu |
| 2 | „kontext N % — zvaž /compact“ | na konci tahu ≥ 80 % podle `$.session.usage()`; znovu až po poklesu pod 80 % |
| 3 | „N h práce — dej si pauzu ☕“ | na začátku tahu: každé 2 h od `startedAt` sezení, jednou za značku |
| 4 | krátká gratulace | prošel commit / push |

Nová hláška nahradí tu na obrazovce jen když je stejně důležitá nebo důležitější.

## Kontrakt

- Píše: `hint` (`Hint | null`, `hint-1`). Nulu zapíše `hintsTurnStart` (zmizení po tahu).
- Čte: `$.session.usage()` (kontext, začátek sezení), `$.clock`. Události dostává od kořene.
- Mute neřeší: `face` hlášku při `muted` nekreslí (hláška se tím „spotřebuje“, nevrací se po zapnutí).

## Nepatří sem

| věc | kam |
|---|---|
| kreslení hlášky | `face` |
| `/buddy mute` | `command` |
| rozpoznání commitu | `shared/classify.ts` |

## Pasti

- Paměť (`mem`) je proměnná modulu: po hot reloadu se hláška může ukázat znovu.
- Údaj o kontextu je nepovinný (`percent?`); bez něj se hláška neukáže.
- Nic se nezamítá ani nepřepisuje: `tool.call` kořene jen čte výsledek.
