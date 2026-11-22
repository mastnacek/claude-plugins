# Changelog

## 0.9.5

### Added
- `skipPatterns` setting (list of regex sources, default `[]`, global or project JSON): a prompt or command
  argument whose trimmed text matches one is never detected or translated. The log line is
  `kind: "detect", reason: "skip_pattern", skipped: true`. An invalid regex is ignored with a debug line.
  `/prompt-translate help` shows how many patterns are set.

## 0.9.4

### Changed
- The marker is a coloured badge (bold, inverse, success colour, coloured `🌐️`) drawn above the reply instead of
  italic markdown, so it stands out from the text.

## 0.9.3

### Added
- A translated answer is drawn with a marker line above it (`🌐 *Přeloženo:*` in the target language, `Translated`
  for languages without a label), so it is visible that the plugin translated it. Screen only; the stored message
  stays English.

## 0.9.2

### Fixed
- Answers of turns that no prompt started (background-task notifications) stay English no more: they are translated
  by the configuration (`enabled` and `translateResponses`). Turns with a translated prompt keep that prompt's own
  toggle. An answer that already has a translation is never translated twice.
