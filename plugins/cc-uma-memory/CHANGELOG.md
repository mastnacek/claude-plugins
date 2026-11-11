# Changelog

## Unreleased

### Fixed
- Shadow worker: fewer false drafts.
  - A request for an operation ("Enable uma memory globally instead of claude memory; there is an uma command for this.") is no longer a `user_correction`: messages that open with an operation verb (enable, add, zapni, přidej, …) or point at a command ("command for this", "uma command") are skipped, unless they also carry an explicit error indicator ("Fix it, that's wrong", "Oprav to, je to špatně"); "instead of" alone is not one.
  - A `compiler_recovery` draft is staged only when a non-test file changed between the red and the green run (tracked in `shadowState.failure.edited`, from `Edit`/`Write` and shell writes such as `sed -i`). Recoveries by editing only tests, or by a bare rerun, stage nothing. The draft context is the error plus the files that fixed it, never the edit command.
