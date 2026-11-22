# Changelog

## 0.9.2

### Fixed
- Answers of turns that no prompt started (background-task notifications) stay English no more: they are translated
  by the configuration (`enabled` and `translateResponses`). Turns with a translated prompt keep that prompt's own
  toggle. An answer that already has a translation is never translated twice.
