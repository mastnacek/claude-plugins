# Slice: waiver

## Proč existuje

Pravidlo bez instant failure se někdy porušit opravdu musí (W29 u mechanické hromadné úpravy). Agent o výjimku požádá předem a rozhodne člověk
(nebo orchestrátor) — místo tichého porušení a odečtu, nebo zamítnutí v režimu `block`. Kdyby řez zmizel, výjimky nejdou udělit a porušení se počítají / zamítají.

## Co dělá

- `startWaiver` (kořen při `session.start`) — `$.tool.register` nástroje **`watchdog_waiver`** `{ rule, reason, scope?: { calls? } }`
  (`isDeferred: false`, popis pro model: kdy ho použít, že rozhoduje člověk, že instant-fail pravidla odmítne).
- `tool.call {watchdog_waiver}` (plné jméno `mcp__cc-agent-watchdog__watchdog_waiver`):
  1. `request.parseRequest` — chybné vstupy (id, důvod ≥ 5 znaků, `calls ≥ 1`, víc než 20 se zkrátí) vrátí text modelu, bez dialogu a bez řádku v deníku;
  2. neexistující / pro roli neplatné (vypnuté, orchestrátor) pravidlo → text, bez dialogu;
  3. pravidlo s instant failure nebo s `noWaiver` (W28) → `shared/waivers.refusal`, řádek `waiver` `deny`/`policy`, bez dialogu;
  4. jinak `$.ui.ask` (hlavička `👁 Watchdog • žádost o výjimku`, pravidlo + popis, role, důvod, rozsah; `✅ Povolit` / `❌ Zamítnout`;
     volný text = zamítnutí s důvodem); dialog nejde (`-p`, zavřeno) = zamítnuto, `deny`/`policy`;
  5. řádek `kind:"waiver"` do deníku (`decision` allow|deny, `decidedBy` dialog|policy), odpověď modelu.
- Výjimka platí do konce tahu, nebo `scope.calls` volání (nejvýš 20), co nastane dřív. Spotřebu nikdo nezapisuje: počítá se z událostí po ní
  (`shared/waivers`), vyhodnotí `shared/judge` (scorecard) a `guard` (blokace).

## Kontrakt

- **Čte:** `CC_ROLE`, `.claude/watchdog.json` + `$.store` (jestli je pravidlo aktivní), `$.ui.ask`.
- **Píše:** řádek `waiver` do deníku (`shared/store.appendEvent`). Nic ve `$.state`.

## Nepatří sem

| co | kam patří |
|---|---|
| vyhodnocení, zda výjimka kryje porušení | `shared/judge`, `shared/waivers` |
| zamítnutí volání v režimu `block` | `guard` |
| výpis otevřených výjimek (`/watch rules`) | `rules` |
| zobrazení v reportu | `report` |

## Pasti

- Dialog patří do `tool.call` hooku (`$.ui.ask` je volání na `$`, takže čas hooku neběží, dokud člověk odpovídá); tlačítka v panelu by hook nestihla.
- Engine vrací label bez U+FE0F: `optionOf` porovnává bez něj. Cokoli jiného než label je volný text = zamítnutí.
- Hook se vybírá regexem `/(^|__)watchdog_waiver$/`, protože plné jméno nese prefix pluginu.
- Žádost sama je volání nástroje: `waivers.isWaiverTool` ji nepočítá do `scope.calls`.
