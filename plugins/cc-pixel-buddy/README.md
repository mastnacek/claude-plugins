# cc-pixel-buddy

Pixelová počítačová hlavička vedle chatu: nálada podle práce, užitečné hlášky a statistiky dne

A small original pixel-computer buddy for Claude Code. It only shows and advises: it never blocks a tool call,
never changes a prompt or a tool input, and never runs anything.

## Install

```
/plugin marketplace add mastnacek/claude-plugins
/plugin install cc-pixel-buddy@mastnacek
```

## What it does

- **Mood that follows the work.** 😊 last test/build passed · 😰 a run of failing tool calls · 🎉 a commit or push went
  through · 😴 no activity for 10 minutes · 🤔 a turn is running · 🙂 otherwise.
- **A strip above the prompt, always** (3 rows, fits from about 60 columns): small head, mood and the one message that
  matters now; with nothing to say, just the head, the mood and today's turns.
- **Useful hints**, each shown once and gone when the next turn starts: same call failed 3× in a row · context at 80 %
  (`/compact`) · every 2 hours of work (take a break) · a short cheer after a commit.
- **Day statistics** (kept between sessions, a new day starts a new record): turns, tool errors, file edits, commits,
  tests green/red.
- **A panel on request** with a bigger head, the mood and today's numbers.

```
╭──────────────────────────────────────────────────────────╮
│ [•_•] 😰 ustaraný · 3× stejná chyba — zkus jiný postup   │
╰──────────────────────────────────────────────────────────╯
```

## Commands

- `/buddy` — status in one frame: mood and today's numbers
- `/buddy open` — open the panel (says so if the window is too narrow; the strip stays)
- `/buddy close` — close the panel
- `/buddy mute on|off` — switch the hints off/on; the head stays; kept between sessions

The messages and labels are in Czech.
