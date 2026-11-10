# Slice: tts-command

## Proč existuje

Rotaci je třeba umět zapnout, vypnout, přidržet na slotu (světla v místnosti
slunce nevidí) a přenastavit, aniž se sahá do souboru. Řez zaregistruje
`/tts`, provede ho a vykreslí víceřádkový výstup. Kdyby zmizel, plugin jede
dál podle `~/.claude/cc-theme-switcher.json`, jen se nedá měnit zevnitř.

## Co dělá

- `startTtsCommand` (`register.tsx`) — zaregistruje `/tts`.
- `command.run {tts}` — provede řádek (`runCommand` v `run.ts`); modelu vrátí jen první řádek.
- `ui.render CommandOutput` — nakreslí celý výstup z `commandOutputs`.
- `prompt.autocomplete` — podpříkazy a hodnoty (`completions`).
- `run.ts` — `help`, `status`, `on`/`off`, `hold <light|dark|dawn|day|dusk|night> [2h|90m|1h30m]`, `hold off`, `slot <slot> <paleta>`, `location <lat> <lon>`, `herdr on|off`. Každá změna se uloží (`saveSettings`) a hned aplikuje.
- `parse.ts` — délka holdu, cíl holdu, souřadnice. `texts.ts` — nápověda a stav česky.

## Kontrakt

- **Čte:** `commandOutputs`.
- **Píše:** `commandOutputs` (nejvýš 20 záznamů); soubor nastavení přes `shared/settings`; `tts.json` přes `shared/apply`.
- **Shared:** `apply`, `settings`, `palettes`, `solar`, `selected-theme`.

## Nepatří sem

| co | kam patří |
|---|---|
| časovač a zápis při startu | `features/rotation` |
| validace nastavení po polích | `shared/settings.ts` |
| výpočet slotu, hold a paleta | `shared/apply.ts`, `shared/solar.ts` |
| výpis přes `$.ui.log` | nikam — log řádek je jednořádkový a `\n` kreslí jako „�“ |

## Pasti

- Text pluginového příkazu jde do požadavků modelu, proto dostane jen první řádek; plný text je v `commandOutputs` pod klíčem „první řádek“. Dva výstupy se stejnou první řádkou se přepíšou.
- Nevalidní JSON v nastavení se nepřepisuje: `saveSettings` vrátí chybu a příkaz řekne „Nic jsem neuložil“.
- `hold` bez délky trvá do další změny slunečního slotu (`nextSlotChange`); vypnutá rotace hold odmítne.
- `$` smí jen do funkcí deklarovaných `function` (validátor enginu), ne do šipek přiřazených do proměnné.
