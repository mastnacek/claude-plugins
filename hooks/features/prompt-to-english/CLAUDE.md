# Slice: prompt-to-english

## Proč existuje

Člověk píše česky, model pracuje nejlépe anglicky. Tenhle řez prompt před
odesláním přeloží do angličtiny a v přepisu konverzace ukáže originál
a angličtinu jako jeden rámeček, aby bylo vidět, co model opravdu dostal.
Kdyby řez zmizel, plugin prompty přestane překládat, ostatní řezy se nerozbijí.

## Co dělá

- `prompt.submit` (`register.tsx`) — přeloží prompt (`translate(…, "English", "prompt")`), na přání se zeptá na potvrzení (`confirm`), uloží záznam originálu a předá odpovědi `pending`.
- Přeskočí slash příkazy, meta zprávy, prompty s obrázkem a vstupy mimo `composer`/`bridge`.
- Autodetekce (`detect` zapnuto, platí i s boostem): angličtina nebo kód se nepřekládá ani neboostuje, jen se nastaví `pending`.
- `ui.render UserMessage` — rámeček originál (`-`) / angličtina (`+`) se štítky `boost` a `s historií`.
- `history.ts` — podle `historyMode` (`off`/`ask`/`auto`/`always`) přiloží poslední výměny; `auto` jen při odkazovacích slovech (`hasDeicticReferences`).
- `english-note.ts` — skrytá poznámka „pracuj anglicky“ do `context` promptu (jen s `note on`).
- `startPromptToEnglish` — obnoví `originals` z archivu relace.

## Kontrakt

- **Čte:** `config` (přes `getConfig`), `originals`.
- **Píše:** `originals` (+ archiv do `$.store`), `pending`.
- **Nepřímo přes `translate()`/`withProgress`:** `translating`, `sessionCostUsd`, `telemetry`, `credit`.
- **Shared:** `config`, `log`, `progress`, `recent-context`, `session-archive`, `state`, `types`, `translation/translate`, `translation/detect`.

## Nepatří sem

| co | kam patří |
|---|---|
| volání modelu, retry, backendy | `shared/translation/translate.ts` |
| maskování kódu, cest a URL | `shared/translation/protect.ts` (interní) |
| zobrazení přeložené odpovědi | `features/answer-to-target` |
| odznak s kreditem a „překládám…“ | `features/indicator` |
| toast „prompt → EN (cena)“ | nikam — záměrně zrušeno, cena je ve `/prompt-translate stats` |

## Pasti

- Atomy `pending` a `originals` jsou deklarované i v `answer-to-target` (a `pending` v `settings-command/run.ts`): klíč, výchozí hodnota a `shape` se musí ve všech souborech shodovat.
- Záznam originálu se hledá podle `textKey(english)`: dva prompty se stejnou angličtinou si záznam přepíšou.
- Prompt, který autodetekce nechala být, záznam v `originals` nemá, takže `answer-to-target` jeho odpověď po reloadu nedopřeloží.
- Překlad s `degraded` jde dál jako původní text a `pending` se nenastaví — odpověď se pak nepřekládá.
