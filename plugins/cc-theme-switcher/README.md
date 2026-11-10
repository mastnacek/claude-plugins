# cc-theme-switcher

A [Claude Code](https://claude.com/claude-code) plugin that rotates the theme by the sun: a dawn, a day, a dusk and a night palette, switched as the sun rises and sets where you are.

Port of the pi extension [time-theme-switcher](https://github.com/mastnacek/time-theme-switcher).

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install cc-theme-switcher --marketplace mastnacek/claude-plugins
```

Answer `y` to add the marketplace, then pick the user scope so it loads in every session. From a shell:

```
claude plugin install cc-theme-switcher --marketplace mastnacek/claude-plugins
```

## Setup: pick the theme once

Claude Code has no call to switch themes from a plugin, but it reloads custom themes from `~/.claude/themes/` while it runs. The plugin keeps one file there, `tts.json`, and rewrites it as the sun moves. You choose it once:

1. Start Claude Code with the plugin enabled. It writes `~/.claude/themes/tts.json` and logs a line telling you what is left to do.
2. If that folder did not exist before, restart Claude Code once so it starts watching it.
3. Run `/theme` and pick **tts** (stored as `"theme": "custom:tts"` in `~/.claude/settings.json`).

From then on the colours follow the slot. `/tts status` shows whether `custom:tts` is the selected theme.

## What it does

- **Four slots by the height of the sun.** `day` while the sun is above −0.833°, `dawn` / `dusk` while it is between −12° and −0.833° and rising / setting, `night` below −12°. A morning runs night → dawn → day, an evening day → dusk → night.
- **Five bundled palettes.** `tts-dawn` (Gruvbox Material Soft Dark), `tts-day` (Solarized Light, the only light one), `tts-dusk` (Catppuccin Macchiato), `tts-night`, `tts-osaka-jade` (Osaka Jade). Defaults: dawn → `tts-dawn`, day → `tts-day`, dusk → `tts-dusk`, night → `tts-osaka-jade`.
- **Writes only on change.** A check every minute; the theme file is rewritten only when the palette differs from what is in it, so several sessions at once do no harm.
- **Quieter `auto mode on`.** The warning colour is mixed half-way with the muted colour, so the status line is not loud yellow.
- **Hold.** The sun cannot see the room lights: `/tts hold dark` pins the night palette until the next change of the sun's slot, or for a time you give.
- **Off.** `/tts off` leaves `tts.json` with only the light or dark base, so Claude Code's own colours show.
- **herdr (optional, off by default).** With `/tts herdr on` the `[theme]` of herdr's `config.toml` follows the slot, then `herdr server reload-config` runs. With it off, herdr's config is never read.

## Commands

```
/tts help                                   all commands
/tts status                                 on/off, slot and palette, hold, location, herdr, is custom:tts selected
/tts on | off                               turn the rotation on or off, applied at once
/tts hold <light|dark|dawn|day|dusk|night> [2h|90m|1h30m]
                                            pin a slot (light = day, dark = night); no length: until the sun's slot changes
/tts hold off                               release the hold
/tts slot <dawn|day|dusk|night> <palette>   assign a bundled palette to a slot
/tts location <lat> <lon>                   coordinates (−90…90, −180…180)
/tts herdr on | off                         follow the slot in herdr's config.toml
```

## Settings file

`~/.claude/cc-theme-switcher.json`, shared by every session (under `$CLAUDE_CONFIG_DIR` if you set it). The commands above write it; editing it by hand works too.

```json
{
  "enabled": true,
  "latitude": 50.0755,
  "longitude": 14.4378,
  "themes": { "dawn": "tts-dawn", "day": "tts-day", "dusk": "tts-dusk", "night": "tts-osaka-jade" },
  "hold": null,
  "syncHerdr": false
}
```

Each field is checked on its own: a bad one falls back to its default and the rest are kept. A file that is not valid JSON is never overwritten; the plugin logs it and runs on the defaults until you repair it.

## Limits

- The interface (`/tts` output and notices) is Czech only.
- Slots accept the five bundled palettes only, not other themes.
- The herdr `config.toml` is rewritten in place (no atomic rename is available to plugins).
