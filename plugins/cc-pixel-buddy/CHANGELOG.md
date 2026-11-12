# Changelog

## Unreleased

### Fixed
- The strip above the prompt was invisible when the band had fewer than 3 rows (only `↓ n more` showed): it now draws
  one bare row there. Its frame is as wide as the band instead of shrinking to the text.
- The `/buddy open` panel fits its width: rows are truncated and the big head is left out when the panel is narrow.

## 0.1.0

### Added
- Pixel-computer buddy with a mood that follows the work: spokojený (test/build passed), ustaraný (3+ failing tool
  calls in a row), slaví (commit/push), spí (10 min idle), přemýšlí (a turn runs), výchozí.
- A strip above the prompt (3 rows, works from about 60 columns) with the head, the mood and the most important hint.
- Hints, each shown once and removed by the next turn: same call failed 3× in a row, context 80 % (when the engine
  reports it), every 2 hours of work, a cheer after a commit.
- Day statistics in `$.store`: turns, tool errors, file edits, commits, tests green/red.
- `/buddy` (status), `/buddy open|close` (panel), `/buddy mute on|off`, with argument completion.
