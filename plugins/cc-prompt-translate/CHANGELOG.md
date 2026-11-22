# Changelog

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
