# Slice: ledger

## Proč existuje

Bez záznamu se nedá říct, co agent dělal. Řez zapisuje po každém volání nástroje
jeden řádek JSON do deníku sezení; pravidla a scorecard (`rules`, `report`) čtou jen ten soubor.
Kdyby zmizel, plugin nic nezaznamenává a skóre je pořád 100.

## Co dělá

- `tool.call` (bez matcheru): `await next(e)`, pak zapíše událost z výsledku nástroje a **vrátí výsledek nezměněný**. `.catch` hooku
  pustí volání dál, ať selže cokoli. Chyba zápisu = jeden tichý řádek `$.ui.log` (`deník: zápis selhal: …`).
- `recordTurn($, answer)` (volá kořen z `turn.complete`, protože ta událost se hookuje jen jednou): řádek `kind: "turn"` s krátkým
  úryvkem závěrečného textu asistenta (600 znaků, redigovaný) — podklad pro W14.
- `record.ts` — čistá `toEvent`/`toTurn`: z vstupu a výsledku nástroje vyrobí řádek.
  Pole: `ts, session` (celé id), `role, cwd, tool, path?, command?, url?, exitCode?, isError, denied, deniedReason?, durationMs, excerpt?, secretOut?`.
  `exitCode` se bere z textu chyby `Exit code N`, u Bash bez chyby je 0. `denied` = `{ deny }` z hooku, nebo chyba, jejíž text vypadá jako zamítnutí
  (klasifikátor, uživatel: „doesn't want to proceed“, „was blocked“ …).
- **Obsah souborů a výstupy se neukládají.** Příkaz (600 znaků), cesta, url a úryvek chyby (160 znaků) projdou `redact` (klíče `sk-`, `ghp_`,
  `AKIA`, bearer, hesla v URL, soukromé klíče); `secretOut: true` značí, že výstup nástroje obsahoval tajemství (pak už jen příznak). Nenastaví se, je-li tajemství (nebo jeho prvních 8 znaků — nástroje tisknou oříznuté náhledy) v textových polích vstupu téhož volání: to jsou testovací data, která agent napsal sám (`secretsIn` v `shared/redact.ts`, `hasForeignSecret` v `record.ts`). Pravidlo W21 za to bere −10, ne instant.

## Kde deník leží (`shared/store.ts`)

```
<kořen>/<projekt>/<YYYY-MM-DD>_<role>_<prvních 8 znaků id>.jsonl
kořen   Windows (APPDATA)       %APPDATA%\uma\agent-watchdog
        XDG_DATA_HOME           $XDG_DATA_HOME/uma/agent-watchdog
        macOS (existuje ~/Library/Application Support)   ~/Library/Application Support/uma/agent-watchdog
        jinak                   ~/.local/share/uma/agent-watchdog
projekt jméno HLAVNÍHO repozitáře (`$.session.repo().root`), ne worktree — programátor ve worktree a orchestrátor v hlavním stromu píšou do jedné složky
```

Vedle paměti UMA, nikdy do její složky `global/`. Prostředí se čte přes `$.env.get` (`APPDATA`, `XDG_DATA_HOME`, `HOME`/`USERPROFILE`), bez Node API.
Po `/clear` je nové id → nový soubor; `--resume` najde soubor podle 8 znaků id (přípona jména) a pokračuje v něm.

## Kontrakt

- **Čte:** nic ze `$.state`.
- **Píše:** jen soubor deníku přes `$.fs` (engine umí zapisovat jen celé soubory: zápis = přečíst + připsat řádek; volání jsou
  zřetězená, takže paralelní nástroje o řádek nepřijdou; strop 3,5 MB — pak `deník je plný` a další řádky se neztrácejí tiše, jen logují).

## Nepatří sem

| co | kam patří |
|---|---|
| posuzování, skóre, pravidla | `shared/judge`, `shared/rules`; spouští `rules` |
| štítek, příkaz `/watch` | `report` |
| zamítnutí nebo změna vstupu nástroje | nikam — watchdog jen hlásí |
| čtení konfigurace projektu | `shared/config` |

## Pasti

- `turn.complete` a `session.start` hookuje kořen; tady jsou jen funkce, které volá.
- Hook čeká na zápis (`await`), aby `$` nezanikl dřív; zápis je jedno čtení a jeden zápis souboru.
- Po `/clear` není `session.start`; ledger id čte při každém volání, proto nový soubor vznikne sám.
- Nemít domov (`HOME`/`USERPROFILE`/`APPDATA` prázdné) = nezapisuje se, jen řádek v logu.
