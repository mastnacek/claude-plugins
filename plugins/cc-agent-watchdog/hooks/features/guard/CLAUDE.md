# Slice: guard

## Proč existuje

Report přijde až po činu. Pravidlo, které někdo přepnul na `block`, má volání zastavit **dřív**, než se provede. Kdyby řez zmizel,
všechna pravidla zůstanou v režimu `report` (nic se nezamítá), deník a skóre fungují dál.

## Co dělá

- `tool.call {Bash, Write, Edit, MultiEdit, NotebookEdit, Read}` — z události vyrobí pseudo-řádek deníku (`shared/block.callOf`), pustí predikáty
  pravidel, která jsou pro roli aktivní, mají `pre: true` a režim `block` (`shared/settings.stateOf`), a při porušení vrátí
  `{ deny: "<id>: <důvod>. Použij <správná cesta>, nebo požádej o výjimku nástrojem watchdog_waiver." }`. U pravidel s instant failure místo toho
  „výjimku u tohoto pravidla nelze udělit“.
- Platná výjimka (`shared/waivers.openWaiver`: udělená, nevypršel tah, nevyčerpaný `scope.calls`) pravidlo přeskočí — deník se čte až když nějaké pravidlo volání porušuje.
- Orchestrátor se nezamítá nikdy.
- **Fail-open:** jakákoli chyba vyhodnocení (`$.session.*`, soubor, predikát) = volání projde a jeden řádek `$.ui.log` (`blokace: vyhodnocení selhalo, volání projde: …`).
  `.catch` hooku pustí volání i při pádu samotného hooku.
- Registruje se v kořeni **po** `ledger`, takže ledger zamítnutí vidí a zapíše (`denied`, `blocked: true`). `blocked` poznává podle textu zamítnutí
  (`shared/block.isBlockReason`); W19 a W20 takové volání nepočítají.

## Kontrakt

- **Čte:** deník (soubor, jen při porušení), `.claude/watchdog.json`, `$.store` (přes `shared/config`), `CC_ROLE`.
- **Píše:** nic. Jen vrací `{ deny }`.

## Nepatří sem

| co | kam patří |
|---|---|
| které pravidlo je zapnuté / v jakém režimu | `shared/settings` |
| co pravidlo hlídá | `shared/checks` + `shared/rules` (`pre`, `way`) |
| udělení výjimky | `waiver` |
| zápis zamítnutí do deníku | `ledger` |
| pravidla, která potřebují výsledek nebo historii (W08, W11, W14, W17, W19, W20, W28) | zůstávají `report` |

## Pasti

- Predikát musí jít spustit nad jedním voláním (`pre: true`). Přidáš-li pravidlo, které čte historii, `pre` mu nedávej.
- Zamítnutí se nemá chovat jako obchvat: text začíná `Wxx: ` a obsahuje `watchdog_waiver`; změníš-li ho, změň `isBlockReason`.
- Hook nesmí zamítat nic mimo uvedené nástroje; ostatní (včetně `watchdog_waiver`) jdou beze změny dál.
