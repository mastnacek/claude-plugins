# Changelog

## 0.14.2

### Fixed
- Recall: after a compaction the already-inserted facts are forgotten, so they can be inserted again (the context that held them is gone).
- Recall: a prompt with Czech diacritics is searched with `--judge jev-relevance --semantic-fallback`, as a safeguard for a prompt that skipped translation (with the plugins installed, translation runs first and recall gets English); the timeout for it is 8 s.

### Added
- `UMA_RECALL_DEBUG=1` logs the first 60 characters recall is asked with.

## 0.14.1

### Fixed
- Shadow worker: fewer false drafts.
  - A request for an operation ("Enable uma memory globally instead of claude memory; there is an uma command for this.") is no longer a `user_correction`: messages that open with an operation verb (enable, add, zapni, přidej, …) or point at a command ("command for this", "uma command") are skipped, unless they also carry an explicit error indicator ("Fix it, that's wrong", "Oprav to, je to špatně"); "instead of" alone is not one.
  - A `compiler_recovery` draft is staged only when a non-test file changed between the red and the green run (tracked in `shadowState.failure.edited`, from `Edit`/`Write` and shell writes such as `sed -i`). Recoveries by editing only tests, or by a bare rerun, stage nothing. The draft context is the error plus the files that fixed it, never the edit command.
