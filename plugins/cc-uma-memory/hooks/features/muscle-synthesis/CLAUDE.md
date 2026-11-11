# Slice: muscle-synthesis

## Proč existuje

Člověk (nebo model) znovu a znovu spouští stejnou trojici příkazů. Řez to pozná
a **navrhne** rutinu (port `hooks/muscle_synthesis.ts` + `slices/muscle/policy.ts`
z pi). Návrh je koncept `skill` ve stagingu s šablonou kroků; rutinou se stane
až po souhlasu v `/uma review`. Nikdy `uma muscle new` přímo.

## Co dělá

- `tool.call {tool: "Bash"}` po úspěšném výsledku (`next(e)`, bez `isError`/`deny`) — příkaz se zkrátí na tvar (`normalizeCommand`: první dva tokeny, bez složených řádků `&& || ; |`, bez `git push|pull|reset|rebase|checkout`, `rm`, `sudo`, …) a přidá do historie (40). `detectRepeatedSequence` hledá první 3členný úsek, který se v okně 30 vyskytl 2× bez překryvu (tři stejné příkazy nejsou sekvence). Nová sekvence → `uma staging create --type skill --title muscle:<jméno> --body … --template <JSON kroků> --trigger muscle_synthesis --confidence 0.8 --tags muscle,routine,routine-proposal,shadow-worker` a řádek logu „💪 …“. Jeden návrh na sekvenci a sezení.
- `policy.ts` — čistá logika z pi i s jejími testy (`normalizeCommand`, `routineName`, `detectRepeatedSequence`, `buildRoutineProposal`), `pushCommand`, `createArgv`.
- Vypíná ho `settings.shadow = off` (je to návrh stínového pracovníka).

## Kontrakt

- **Čte:** `settings` (`shadow`).
- **Píše:** `commandHistory` — `{ shapes, raw, proposed }` (jediný zapisovatel).
- **Procesy:** jen `uma staging create`.

## Nepatří sem

| co | kam patří |
|---|---|
| spuštění rutiny `uma muscle run --confirm` | `write-gate` (brána s dry-runem) |
| schválení návrhu, štítek ` 📝N` | `staging` |
| přepínač | `uma-command` (`/uma shadow`) |

## Pasti

- Historie je v atomu (`$.state`), tedy přežije reload, ale ne nové sezení.
- `uma muscle run …` samo se do historie také počítá (tvar `uma muscle`), jako v pi.
- Šablona je jen data; motor ji nespouští bez souhlasu. Kroky jsou prvními dvěma tokeny rozdělené řádky: uvozovky s mezerou tokenizér rozdělí.
- Ve výstupu pi hlásí návrh `ui.notify`; zde `$.ui.log` (jeden řádek).
