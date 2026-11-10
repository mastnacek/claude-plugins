---
name: reverse-spec
description: Reverse-engineer a verifiable spec from an existing codebase so it can be rebuilt in another language with proven parity. Use when the user wants to migrate, port or rewrite legacy code (VBA, LotusScript, COBOL, any old system), document a project for rebuilding, write characterization tests, or extract business rules into a spec.
---

# Reverse spec

Turn an existing system into a spec someone can rebuild from, then prove the
rebuild behaves the same. The old system is the **oracle**: the only source
of correct answers. Code stays the source of truth; the spec is *anchored* to
it (edited alongside), never a replacement for it.

Three leading words run through every step:

- **oracle** — the running old system. A value counts only once the oracle
  returned it.
- **hypothesis** — any expected value, rule or scenario the oracle has not
  confirmed. A test that never ran against the old system is a hypothesis.
- **gap** — what the code cannot tell you. It goes to `spec/gaps.md` for a
  human, never into code as a guess.

## Step 0 — Scaffold the project

Copy this skill's `templates/` into the project root without overwriting
anything that exists (`cp -rn <skill dir>/templates/. <project>/`). Move the
original code into `legacy/` (read-only from now on). Fill
`spec/invariants.md` with what must hold everywhere (money type, rounding
rule, naming of domain terms) — the plugin injects that file into every
session, so it replaces a project `CLAUDE.md`.

Done when: `legacy/`, `spec/rules/`, `spec/invariants.md` and
`traceability.md` exist and `/reverse-spec check` runs.

## Step 1 — Lock behaviour

Before reading architecture, capture what the system does **today**, bugs
included. Two layers, never mixed:

| | Golden files / approval tests | Gherkin scenarios |
|---|---|---|
| For | mass regression net | business rules you *understood* |
| Source | recorded from real (anonymised) production inputs | written by hand or LLM, then run against the oracle |
| Count | hundreds–thousands | tens |

Build a harness that serialises input and output of the old code
(`harness/`), record pairs into `tests/golden/`, side-effects into
`effects.jsonl`. Tag found bugs `@legacy-bug` and keep them — fixing is a
business decision made after parity.

Done when: every module you will migrate has golden pairs recorded by the
oracle, and every Gherkin expected value came from an oracle run.

## Step 2 — Extract rules into the spec

One rule = one file = one ID: `spec/rules/BR-<AREA>-<NNN>.yaml`. Only what
would hold in any target language goes in `spec/`; language, libraries,
module layout and error strategy go to `target/<lang>/target-architecture.md`.
Every claim carries `confidence: confirmed | inferred | gap` and a `source`.
Schema and the in/out boundary: [references/rule-schema.md](references/rule-schema.md).

**Where the source is missing** (only a binary, APK, JS bundle, firmware or a
running app), extract evidence with the `reverse-engineer-anything` skill / REA
tools if the session has them: [references/rea-bridge.md](references/rea-bridge.md).
Without them, record the missing parts as gaps and tell the user.

When unsure, write the question into `spec/questions.md` and move on.

Done when: every branch of the module's code is covered by a rule or listed in
`spec/gaps.md`, and every rule has `source` and `confidence`.

## Step 3 — Model state only where it exists

Results depending on history → statechart (`spec/machines/*.json`, XState
JSON, guards and actions as **names only**). Many input combinations → one
result with no memory → decision table (`spec/tables/*.csv`). Test and
format: [references/state-vs-table.md](references/state-vs-table.md).

Done when: each machine's states are nouns an operator would recognise, and
each table is checked for completeness and contradictions.

## Step 4 — Generate code

Deterministic generator for structure (entities, DTOs, machine skeletons,
function signatures, test skeletons) into `generated/`; LLM for rule bodies
into `src/`, **one rule per task**, given only that rule's YAML, the
signature and its tests. Commit message carries the rule ID. Details:
[references/codegen.md](references/codegen.md).

Done when: the module's golden and Gherkin tests are green and every new
function names the rule ID it implements.

## Step 5 — Verify against the oracle and cut over

Three gates in order: golden corpus → differential property tests (same
generated inputs into old and new, outputs must be equal) → shadow run on
live data. A deviation is fixed by adding or correcting a rule in the spec,
then regenerating — never by patching code alone. Normalisation rules,
exit criteria, strangler-fig cutover: [references/parity.md](references/parity.md).

Done when: the module meets its numeric exit criteria written in
`traceability.md` before the work started.

## Gates the plugin enforces

- Edits under `legacy/` and `generated/` are refused (hook on `Edit`,
  `Write`, `NotebookEdit`). Change the generator or the spec instead; shell
  commands are not guarded, so write those folders only through the
  generator or a harness recording.
- `spec/invariants.md` is added to the system prompt of every session in
  this project.
- The status line shows `spec ✔confirmed ~inferred ?gap · N without test`.
- `/reverse-spec check` reports rules without `confidence`, `source` or
  `verified_by`, and rule IDs no `.feature` file tags. Run it after every
  step; treat its findings as red.

## Keep the ceremony small

Use this workflow for migrations and new verticals, not for a single bug fix.
Stop expanding the spec when a rule could be translated mechanically: it
describes *what*, never *how*. If the spec outgrows a few dozen pages, nobody
reads it — split by module. Find dead code by measuring calls in production,
and migrate only what runs.
