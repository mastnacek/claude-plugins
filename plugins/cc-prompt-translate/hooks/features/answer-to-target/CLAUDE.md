# Slice: answer-to-target

## Proč existuje

Model odpovídá anglicky, člověk chce číst česky. Tenhle řez finální odpověď
přeloží na pozadí a vykreslí ji místo anglické; uložená zpráva zůstává
anglická, takže kontext modelu se nemíchá. Bez řezu se odpovědi zobrazují
anglicky, nic jiného se nerozbije.

## Co dělá

- `turn.complete` (`register.ts`) — jen hlavní agent (ne subagenti): vezme a vynuluje `pending`, překlad spustí na pozadí přes `$.clock.after(0, …)`, tah na něj nečeká.
- `ui.render AssistantMessage` — místo anglického textu vykreslí překlad z `finals` (podle `textKey`); souhrny (`isSummary`) nechá.
- `session.end` — zahodí `pending`, který žádný tah nedokončí.
- `startAnswerToTarget` — obnoví `finals` z archivu a dopřeloží odpověď, kterou přerušil reload (`recoverMissedAnswer`).
- Překládá se jen finální odpověď (`reason === "answer"`), text mezi voláními nástrojů zůstává anglicky.

- `already-target.ts` — `isAlreadyCzechOrSlovak`: odpověď, která už je česky nebo slovensky (podíl slov s diakritikou bez kódu a cest ≥ 15 %), se nepřekládá; jednotlivé citované české slovo v anglické odpovědi o tom nerozhoduje.

## Kontrakt

- **Čte:** `pending`, `finals`, `originals`, `config`.
- **Píše:** `finals` (+ archiv do `$.store`), `pending` (nuluje).
- **Nepřímo přes `translate()`/`withProgress`:** `translating`, `sessionCostUsd`, `telemetry`, `credit`.
- **Shared:** `config`, `log`, `progress`, `session-archive`, `state`, `types`, `translation/translate`.

## Nepatří sem

| co | kam patří |
|---|---|
| překlad promptu do angličtiny | `features/prompt-to-english` |
| obnova `originals` po restartu | `features/prompt-to-english` (`startPromptToEnglish`) |
| příznak „překládám…“ v odznaku | `shared/progress.ts` → `features/indicator` |
| toast „odpověď → cílový jazyk“ | nikam — záměrně zrušeno |

## Pasti

- `startAnswerToTarget` musí běžet po `startPromptToEnglish`: `recoverMissedAnswer` čte `originals`, které obnovuje ten druhý. Pořadí drží `hooks/register.tsx`.
- `pending` je jeden slot: nastavují ho dva řezy — `prompt-to-english` (běžný prompt) a `command-arguments` (skill/slash příkaz, který `prompt-to-english` přeskočí) — tady se čte a maže, a `/prompt-translate` ho při vypnutí ruší (`settings-command`).
- Atomy `pending`, `finals` a `originals` se deklarují v každém souboru, který je čte; klíč, výchozí hodnota a `shape` se musí shodovat.
- Překlad je asynchronní: odpověď se chvíli ukazuje anglicky, než `$.ui.invalidate("ui.render")` překreslí.
- Překlad se páruje s odpovědí přes `textKey(answer)`; změněný text zprávy se s překladem nespáruje.
