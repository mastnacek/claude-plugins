# cc-reverse-spec

Reverse-engineers a verifiable spec (rules, tests, traceability) from an existing codebase so it can be rebuilt with proven parity.

## Install

```
/plugin marketplace add mastnacek/claude-plugins
/plugin install cc-reverse-spec@mastnacek
```

## What it does

In a migration project (a folder with `spec/rules/`); elsewhere the plugin does nothing.

- **Project invariants in the prompt** — `spec/invariants.md` is added to the system prompt (truncated above ~8 kB).
- **Guard for `legacy/` and `generated/`** — Edit, Write and NotebookEdit there are refused, with advice on what to do instead. Bash is not watched.
- **Spec check** — rules without `confidence`, `source` or `verified_by`, rule IDs without a `@<ID>` scenario, tags without a rule.
- **Status line** — `spec ✔<confirmed> ~<inferred> ?<gap>`, plus `· N bez testu` for rules no scenario covers.

## Commands

- `/reverse-spec check` — verify `spec/rules/` against `tests/features/` and write `spec/confidence.md`; without an argument it prints help.
