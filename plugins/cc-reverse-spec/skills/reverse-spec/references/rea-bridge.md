# Working with REA when the source is missing

REA (the `reverse-engineer-anything` skill and its `mcp__rea__*` tools)
extracts evidence from shipped artifacts: native binaries, managed
assemblies, APK/IPA, Electron/JS bundles, firmware, running browser or
Electron apps. It is not part of this plugin and may be absent.

## When to use it

- Only a compiled or packaged artifact exists for part of the system.
- Behaviour must be observed at runtime (a page, an Electron app) because the
  source does not explain it.

When the full source is in `legacy/`, read it with ordinary tools; REA itself
skips plain source repositories.

## If REA is absent

Check the session's tool list for `mcp__rea__*` or the
`reverse-engineer-anything` skill. Missing → tell the user which part needs it,
record each unreadable part as a `gap` in `spec/gaps.md`, and continue with
the parts you can read. Do not install or configure REA without the user.

## Mapping REA results into the spec

| REA says | Rule gets |
|---|---|
| observation (Evidence with observed authority) | `confidence: confirmed`, `source: - evidence: <evidence_id>` |
| inference | `confidence: inferred`, same `source` |
| unknown (`record_unknown`) | `confidence: gap`, line in `spec/gaps.md` with the unknown's ID |

Keep REA's limitations and coverage notes in the rule's `open_questions`.
Static analysis never proves execution: a rule built only on static evidence
of a runtime path stays `inferred` until a golden test or runtime capture
confirms it.

## Useful REA tools for this workflow

- `trace_application_feature` / `trace_feature` — follow one feature from an
  entry point; one rule per traced behaviour.
- `record_unknown` / `update_unknown` — keep REA's unknowns in sync with
  `spec/gaps.md`.
- `capture_browser_scenario`, `capture_electron_scenario`,
  `capture_process_scenario` — record oracle behaviour as golden pairs when
  no harness can call the old code.
- `verify_reconstruction` — an extra check of declared claims. A pass covers
  only those claims; the parity gates in [parity.md](parity.md) remain the
  proof.
