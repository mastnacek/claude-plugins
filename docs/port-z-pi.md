# Port rozšíření z pi

Port jde stejnými třemi kroky jako nový plugin (`novy-plugin.md`). Mezi
názvem a kostrou přidej **inventuru**; při programování převáděj podle
tabulky níž. Vzor hotového portu: `plugins/cc-prompt-translate`
(z `pi-prompt-translate-czk`).

Zdroj pi rozšíření je lokálně v `~/.pi/agent/git/github.com/mastnacek/<repo>/`.

## Inventura (mezi krokem 1 a 2)

Projdi pi rozšíření a sepiš do tabulky, kterou uživatel schválí:

```sh
cd ~/.pi/agent/git/github.com/mastnacek/<repo>
grep -rhoE 'pi\.(on|registerCommand|appendEntry|events\.on|getCommands)\("?[a-z_:.-]*' index.ts src | sort | uniq -c
grep -rhoE 'ctx\.(ui|sessionManager|modelRegistry)\.[a-zA-Z]+' index.ts src | sort | uniq -c
```

| sloupec | co do něj patří |
|---|---|
| funkce | co uživatel vidí nebo zapíná, jednou větou |
| pi události / API | z grepu výš |
| Claude Code | protějšek z tabulky níž, nebo **zahodit** |
| řez | do kterého budoucího řezu funkce patří |

Zahazuje se všechno, co v Claude Code nemá vstup:

- integrace s jinými pi rozšířeními (`pi.events.on("at-words:…")`, hlavičky
  `[pi-read-all]`, triggery `@!`, soubory `pi-clipboard-*`): pluginy
  v Claude Code spolu nemluví;
- převody starých konfigurací z pi (`"default"`, booleany místo úrovní):
  port začíná od výchozích hodnot;
- monkey-patching enginu (`installPromptInterceptor` apod.): nahraď událostí;
- úklid odběrů (`unsubscribers`, `session_shutdown` jako drainer): životní
  cyklus hooků drží engine.

Zachovej, co uživatel na stroji s pi reálně používá, i když to pi zmiňuje:
např. klíč z `~/.pi/agent/auth.json`, když `OPENROUTER_API_KEY` nastavený
není. Ověř to (`echo ${OPENROUTER_API_KEY:+ano}`), než to zahodíš.

**Hotovo:** každé volání z grepu má v tabulce protějšek nebo „zahodit“
s důvodem a uživatel tabulku schválil.

## Převodní tabulka pi → Claude Code

| pi | Claude Code |
|---|---|
| `export default function (pi)` | `export const register: Register = (on) => { … }` v `hooks/register.tsx` |
| `pi.on("session_start", …)` | `on("session.start", …)` **jednou na plugin** v kořeni; řezy dostanou `startXxx($)` |
| `pi.on("session_shutdown", …)` | `on("session.end", …)`, jen když je co uklidit ve stavu |
| `pi.on("input", …)` (přepis promptu) | `on("prompt.submit", …)` → `next({ ...e, text })` |
| `pi.on("before_agent_start" / "context")` | skrytý text k promptu: `next({ ...e, context: [...] })` v `prompt.submit`; system prompt: `on("prompt.compose", …)` |
| `pi.on("message_end", …)` (finální odpověď) | `on("turn.complete", …)`: `e.answer`, `e.reason === "answer"`; subagenta pozná `e.agentId !== undefined` |
| `pi.on("tool_call", …)` | `on("tool.call", { tool: "<Název>" }, …)` |
| `pi.registerCommand(name, …)` | `$.command.register({ name, description })` ve startu + `on("command.run", { command: name }, …)` → `{ text }` |
| `pi.getCommands()` | `$.command.list()` |
| `pi.appendEntry(…)` (data v sezení) | `$.state` přes atomy (sezení) + `$.store` (napříč sezeními) |
| modulové singletony (`state.x = …`) | atom v `$.state`; modulová proměnná se při reloadu nuluje |
| `ctx.ui.notify(text)` | `$.ui.log(text)` (jeden řádek) nebo `$.ui.toast(text)` |
| `ctx.ui.setStatus(…)` / footer | `$.ui.status(text)` nebo `ui.render` na `{ component: "PromptHint" }` |
| `ctx.ui.select` / `ctx.ui.confirm` | `$.ui.ask(question, { options, header })` |
| vlastní vykreslení zprávy | `ui.render` na `{ component: "UserMessage" }` nebo `{ component: "AssistantMessage" }` |
| `ctx.sessionManager.getEntries()` | `$.session.messages()` |
| `ctx.sessionManager.getSessionId()` | `$.session.id()` |
| `ctx.modelRegistry.find` + `getApiKeyAndHeaders` | Claude: `$.model.complete({ model, system, prompt })`; jiný poskytovatel: klíč přes `$.env.get` a `$.http.fetch` ve `shared/` |
| `process.env.X` | `$.env.get("X")` |
| `fetch`, `fs`, Node API | `$.http.fetch`, `$.fs.*`; jiný přístup ven modul nemá |
| `setTimeout` | `$.clock.after(ms, fn)`, `$.clock.sleep(ms)` |
| `process.env.PI_SUBAGENT` guard | `e.agentId !== undefined` v událostech agenta |
| vitest | `claude plugin test .` s `import { test, expect } from "claude-code/testing"` |

Přesné tvary událostí a metod: typy v `.claude-plugin/types/claude-code/index.d.ts`
(grep na název) a skill `plugin-authoring`.

## Pasti portu

- **Text příkazu jde modelu do kontextu.** Výstup `command.run` vrať jako
  jeden souhrnný řádek; celý víceřádkový text ulož do `$.state` a vykresli
  přes `ui.render` na `CommandOutput`. Vzor: `prompt-translate/hooks/features/settings-command`.
- **`$.ui.log` je jeden řádek**; `\n` se vykreslí jako `�`.
- **Práce po skončení tahu** (překlad odpovědi na pozadí) přes
  `$.clock.after(0, …)`; reload ji přeruší, takže ve startu dožeň, co chybí.
- **Po reloadu běží `register` i `session.start` znovu**, `$.state`
  a `$.store` zůstávají. Mění-li se tvar uložené hodnoty, změň `shape` atomu.
- **Testy pi** přepiš na rozhraní řezu nebo hlubokého modulu, ne na
  vnitřnosti; test pi integrace zahoď spolu s ní.
