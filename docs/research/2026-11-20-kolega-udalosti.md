# Výzkum: událostmi řízené sledování sezení pro kolegu (SPAI-013)

Datum 2026-11-20. Hvězdy a data z `gh search repos` dnes (VERIFIED). Co není ověřeno, je označeno NEOVĚŘENO.
Žádný repozitář nebyl změněn.

## 1. Které události umí spustit hlídače bez pollingu

### Claude Code hooky (VERIFIED, https://code.claude.com/docs/en/hooks.md)
- Každý hook dostane JSON na stdin: `session_id`, `transcript_path`, `cwd`, `permission_mode`, `prompt_id` a pole podle události.
- Typy handlerů: `command`, `http` (POST JSON), `mcp_tool`, `prompt`, `agent`. `"async": true` u command hooku: běží na pozadí, nic neblokuje.
- Události, které kolegu zajímají:
  - **Stop**: konec tahu. Pole `last_assistant_message`, `stop_hook_active`, `background_tasks`. Nespustí se při přerušení uživatelem.
  - **StopFailure**: konec tahu kvůli chybě API. Pole `error` (rate_limit, authentication_failed, server_error, max_output_tokens, billing_error …).
  - **SubagentStop**: dokončený subagent. Pole `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`.
  - **Notification**: matchery `permission_prompt` (dialog čeká asi 6 s), `idle_prompt` (60 s nečinnosti), `elicitation_dialog`, `agent_needs_input` a další.
  - **PermissionRequest / PermissionDenied**, **PostToolUseFailure** (chyba nástroje), **PreToolUse / PostToolUse** (každé volání, velmi časté), **TaskCompleted**, **SessionStart/End**, **PreCompact/PostCompact**.
- `transcript_path` se zapisuje asynchronně a při spuštění hooku nemusí obsahovat poslední zprávy. Pro konec tahu použít `last_assistant_message` ze Stop.
- Hooky v uživatelském `~/.claude/settings.json` nebo v pluginu pokryjí všechna sezení Claude Code (orchestrátor, programátor, tester, fable).

### herdr CLI a socket API (VERIFIED: `herdr agent --help`, `herdr agent wait --help`, `herdr api schema --json`, reference cc-herdr-plugin-dev)
- Stavy agenta: `idle`, `working`, `blocked`, `done`, `unknown`. `idle` i `done` = připraven na vstup; `done` = idle, ale ještě „neviděný“.
- `herdr agent wait <cíl> --until <stav> [--timeout ms]`: čekání řízené serverem, ale vždy na jeden panel.
- Socket API `events.subscribe` drží spojení a posílá události (filtr např. `pane_id`, `agent_status`). Historie není trvalá; při zaostání přijde `events_lost` a spojení se zavře. Doporučeno: odebírat, pak doplnit stav čtením (`agent list`).
- `herdr notification show` jen zobrazuje notifikaci; není zdrojem událostí.
- Herdr hlídá agenty všech značek (claude, pi, codex …), takže pokryje i ty bez hooků.

### Soubor přepisu
- Růst `~/.claude/projects/<slug>/<sezení>.jsonl`. Nejpřesnější obsah, ale jako spouštěč nespolehlivý (zpožděný zápis). Použít jako čtená data, ne jako trigger.

## 2. Top ~10 nástrojů pro monitoring / observability

| # | Název (URL) | Hvězdy | Akt. | Řádek | Nápad pro kolegu |
|---|---|---|---|---|---|
| 1 | graykode/abtop (https://github.com/graykode/abtop) | 3867 | 2026-11-20 | htop pro AI agenty (Claude Code, Codex), tokeny | Přehled sezení z lokálních souborů bez hooků |
| 2 | Octane0411/open-vibe-island (https://github.com/Octane0411/open-vibe-island) | 2096 | 2026-11-20 | macOS centrum: sezení, schvalování akcí | Blokované dialogy na jednom místě |
| 3 | disler/claude-code-hooks-multi-agent-observability (https://github.com/disler/claude-code-hooks-multi-agent-observability) | 1571 | 2026-11-19 | Hook události → server → živý přehled | Jeden hook skript, jednotný JSON |
| 4 | MioMioOS/MioIsland (https://github.com/MioMioOS/MioIsland) | 546 | 2026-11-18 | Dynamic Island, schvalování | Priorita dialogu nad koncem tahu |
| 5 | Ido-Levi/claude-code-tamagotchi (https://github.com/Ido-Levi/claude-code-tamagotchi) | 438 | 2026-11-12 | Kontrola akcí agenta, detekce porušení | Kolega hledá porušení pravidel |
| 6 | anthropics/claude-code-monitoring-guide (https://github.com/anthropics/claude-code-monitoring-guide) | 393 | 2026-11-20 | Oficiální průvodce (OpenTelemetry) | `prompt.id` spojí hook a telemetrii |
| 7 | onikan27/claude-code-monitor (https://github.com/onikan27/claude-code-monitor) | 315 | 2026-11-14 | Dashboard více sezení, CLI + web | Stav sezení jako jeden řádek |
| 8 | yessGlory17/argus (https://github.com/yessGlory17/argus) | 119 | 2026-11-10 | Monitoring agentů ve VS Code | Časová osa tahů a subagentů |
| 9 | snirt/agenmux (https://github.com/snirt/agenmux) | 67 | 2026-11-19 | tmux monitor stavu Claude/Codex/Pi | Totéž co herdr, potvrzuje vzor „stav z panelu“ |
| 10 | doneyli/claude-code-langfuse-template (https://github.com/doneyli/claude-code-langfuse-template) | 108 | 2026-10-30 | Langfuse pro sezení | Zpětná analýza; pro kolegu příliš těžké |

Související: thruwire/foreman 829 (dohled nad agenty), yohey-w/multi-agent-shogun 1421 (orchestrace přes tmux), kingbootoshi/codex-orchestrator 361, theopitori/hermeskill 39 (zastaví agenta mimo kontrolu), AliHamzaAzam/repomon 24, soulee-dev/claude-code-notify-powershell 92 (Stop + Notification hook → skript).
Poznámka: dotazy „claude code transcript watcher“, „claude code Stop hook notify“, „multi agent supervisor claude“ vrátily nic (AND dotazy); nahrazeny kratšími (`claude code notify`, `agent supervisor`, `claude code orchestrator`).

## 3. pi balíčky (https://pi.dev/packages)

Katalog má 5369 balíčků (VERIFIED, stránka). Stahování/měsíc z první strany „Most downloads“:

| Balíček | Stahování | Nápad |
|---|---|---|
| billion-context | 3.9M | Komprese kontextu; pro kolegu čtení jen přírůstku |
| pi-mcp-adapter | 2.3M | MCP adaptér |
| pi-web-access | 1.5M | Web, URL, PDF |
| pi-subagents | 1.1M | Delegace, skriptované multi-agent workflow |
| context-mode | 212.9K | Úspora kontextu, kontinuita sezení |
| cc-safety-net | 197.1K | Hook blokující destruktivní příkazy a tajné soubory |
| @langchain/langsmith-pi-extension | 164.4K | Trasování sezení |
| @plannotator/pi-extension | 99.3K | Revize plánu s poznámkami |
| pi-memory | 93.5K | Paměť s vyhledáváním |
| @juicesharp/rpiv-todo | 88.5K | Úkoly přežívající kompakci |
| @tintinweb/pi-subagents | 84.8K | Živý přehled flotily subagentů |
| @gotgenes/pi-permission-system | 48.7K | Vynucování oprávnění |
| pi-intercom | 44.3K | Komunikace mezi agenty |
| @braintrust/pi-extension | 41.1K | Automatické trasování sezení, tahů a nástrojů |
| @howaboua/pi-shepherdr | nový | Pi agenti přes Herdr |

GitHub: tintinweb/pi-supervisor 73 (dohlíží na agenta a vrací ho k cíli, nejbližší vzor kolegy), jayshah5696/pi-agent-extensions 77.
NEOVĚŘENO: katalog jsem prošel jen první stranu (50 položek podle stahování); balíčky jsem nečetl do hloubky.

## 4. Herdr pluginy jako spouštěč (doplněk zadání)

### Katalog a repozitáře
- Katalog https://herdr.dev/tui/plugins/ (VERIFIED): komunitní tržiště, plugin se v něm objeví automaticky podle GitHub tématu `herdr-plugin` a souboru `herdr-plugin.toml`. Seznam se načítá skriptem, takže konkrétní položky jsem čerpal z `gh`. Instalace `herdr plugin install owner/repo`. Katalog položky nekontroluje.
- `gh search repos --topic herdr-plugin --sort stars` (VERIFIED, dnes). Skutečné pluginy (ne jen označené téma): eliasstravik/shepherdr 1172 (agenti napříč stroji), persiyanov/herdr-reviewr 1013 (revize diffu, komentáře zpět agentovi), plannotator/herdr-annotate 778, smarzban/herdr-file-viewer 716, alexarthurs/herdr-sidebar 553, **dcolinmorgan/herdr-remote 456** (monitor a ovládání agentů z menu baru, telefonu, Telegramu), 0cv/herdr-mobile-relay 390 (schvalování a monitoring z telefonu), cloudmanic/herdr-plus 384, kryptamine/herdr-auto-title 298, aigorahub/herdr-lantern 75, ragamo/herdr-flock 45, ericbust/namedrop 42 (@zmínky mezi agenty).
- Nejbližší vzor: **dcolinmorgan/herdr-remote**. Jeho manifest (VERIFIED přes `gh api`) obsahuje `[[events]] on = "pane.agent_status_changed" command = ["uv","run","--script","relay/on_event.py"]`. Skript čte `HERDR_PLUGIN_EVENT_JSON` (`data.pane_id`, `data.agent_status`, `data.agent`) a `HERDR_PLUGIN_CONTEXT_JSON` (cwd) a odešle UDP datagram na lokální relay. Tedy: **plugin může odebírat změny stavu agenta a poslat je dál**.

### Události, které plugin může odebírat
Seznam z `herdr api schema --json` (VERIFIED, výběr jmen událostí):
- pane: `pane.created`, `pane.closed`, `pane.updated`, `pane.focused`, `pane.moved`, `pane.exited`, **`pane.agent_detected`**, `pane.output_matched`, **`pane.agent_status_changed`**, `pane.scroll_changed`
- workspace: `workspace.created/updated/renamed/moved/reordered/closed/focused`, `workspace.metadata_updated`
- tab: `tab.created/closed/focused/renamed/moved`; worktree: `worktree.created/opened/removed`; `layout.updated`
- Pozn.: `workspace.metadata_updated` je dostupná jen odběratelům API, plugin hooky nevolá (dokumentace). Neznámé jméno události herdr při `plugin link` ohlásí varováním (`warnings`).
- Spuštění: plugin dostane v prostředí `HERDR_PLUGIN_EVENT`, `HERDR_PLUGIN_EVENT_JSON`, `HERDR_PLUGIN_ID` a další. Hook běží jako samostatný proces **při každé události** (NEOVĚŘENO: souběh a pořadí při rychlém sledu událostí; dokumentace neslibuje sériové spuštění ani debounce). Protokoly: `herdr plugin log`.
- Plugin nemá úložiště spravované herdrem (jen `HERDR_PLUGIN_STATE_DIR` jako cestu): frontu a kurzory si musí vést sám.
- Událost se týká jen stavu a metadat panelu, ne obsahu. Pro obsah čti přepis (cesta z `kolega-sessions.sh`) nebo `herdr agent read`.

### Může být trigger kolegy herdr plugin?
Ano, pro stavové události. Konkrétně:
- Manifest `[[events]] on = "pane.agent_status_changed"` s command skriptem (vzor herdr-remote). Skript vyfiltruje `agent_status` ∈ {`blocked`, `done`, `idle`}, přeskočí panel kolegy a zapíše řádek (čas, pane_id, stav, agent) do souboru fronty ve `HERDR_PLUGIN_STATE_DIR`.
- Druhý `[[events]]` na `pane.agent_detected` a `pane.exited` zachytí začátek a konec sezení (aktualizuje seznam sezení).
- Pokrývá orchestrátora, programátora, testera i fable **jedním mechanismem** a nezávisle na značce agenta (claude, pi, codex), bez úprav `settings.json`.
- Omezení: stav je hrubý (4–5 hodnot). Nezachytí chybu nástroje, SubagentStop ani důvod blokace; to dodají Claude hooky. NEOVĚŘENO: že `done` přichází spolehlivě po každém konci tahu a že `blocked` odpovídá i dialogu `permission_prompt` (herdr stav odvozuje z terminálu; jde ověřit `herdr agent explain`).
- Alternativa bez pluginu: dlouhý proces s `events.subscribe` (socket). Má jediný proces místo spuštění procesu na událost a dá se v něm dělat debounce v paměti; ale sám se musí postarat o `events_lost` a restart. Plugin je jednodušší na instalaci (`herdr plugin link`), proces přesnější na debounce.

## 5. Doporučený návrh triggeru kolegy (seřazeno)

1. **Claude Stop hook** (async command v uživatelském `settings.json`): zapíše do fronty sezení + `last_assistant_message`. Hlavní signál „konec tahu“ pro všechna sezení Claude Code. Zdroj: hooks.md, Stop.
2. **Herdr plugin s `[[events]] on = "pane.agent_status_changed"`** (a `pane.agent_detected`, `pane.exited`): jednotná, na značce agenta nezávislá vrstva pro stavy `blocked`/`done`/`idle` a pro seznam sezení; zapisuje do téže fronty. Zdroj: herdr-socket-api (Event subscriptions), manifest dcolinmorgan/herdr-remote.
3. **Notification (`permission_prompt`, `elicitation_dialog`, `idle_prompt`) a PermissionRequest = zablokovaný dialog.** Nejvyšší priorita, obejde debounce. Dá se potvrdit stavem `blocked` z bodu 2. Zdroj: hooks.md, Notification.
4. **StopFailure a PostToolUseFailure = chyby.** Střední priorita, seskupit podle sezení. Zdroj: hooks.md.
5. **SubagentStop = dokončený subagent.** Do fronty přidat `agent_transcript_path`. Zdroj: hooks.md.
6. **PreToolUse/PostToolUse do kolegy neposílat**, jen je počítat. Volání nástrojů číst z přepisu při dalším Stop. Zdroj: hooks.md (každé volání spouští hook); disler/claude-code-hooks-multi-agent-observability.
7. **Fronta + jediný hlídač s debounce.** Hooky a plugin jen připíšou řádek (sezení, typ, čas, řádek přepisu); nikdy nepíšou do agy přímo. Hlídač dávku sloučí a po 20–30 s klidu pošle jednu pobídku. Duplikáty (Stop z hooku + `done` z herdr pro stejné sezení do ~10 s) sloučit. Zdroj: stávající `kolega-watch.sh` (zapamatovaný poslední řádek).
8. **Neposílat agy, když pracuje.** Test „esc to cancel“ nahradit `herdr agent wait kolega --until idle,done` (řízeno serverem, bez smyčky); fronta se mezitím hromadí a odejde jako dávka. Zdroj: `herdr agent wait --help`.
9. **Čtení přepisu jen od posledního zpracovaného řádku** (kurzor na sezení); pobídka nese `sezení | od–do`, ne obsah. Zachovat princip `kolega-sessions.sh`. Zdroj: hooks.md, Common input fields (zpožděný zápis).
10. **Časovač jen jako pojistka** (např. 30–60 min), pokud ve frontě něco zůstalo nebo se ztratily události. Zdroj: herdr-socket-api (`events_lost`: historie není trvalá).
11. **Identita sezení.** Role se mapuje přes `herdr pane list` (jako dnes), `session_id` z hooku na `agent_session` panelu. NEOVĚŘENO: že obě ID jsou stejná (stávající skript to předpokládá).
12. **Vyloučit kolegu samého** filtrem podle panelu/role, jinak jeho vlastní Stop/`done` spustí smyčku. Zdroj: `grep -v "|$pane|"` v `kolega-watch.sh`.

## 6. Co nebylo ověřeno
- Hooky ani herdr plugin jsem nespouštěl (jen dokumentace, `gh`, `herdr api schema`); chování souběhu a spolehlivost stavu `done`/`blocked` je NEOVĚŘENO.
- Hvězdy jsou stav 2026-11-20; kód repozitářů jsem nečetl kromě manifestu a `on_event.py` v herdr-remote.
- Seznam pi balíčků je první strana katalogu řazená podle stahování.
