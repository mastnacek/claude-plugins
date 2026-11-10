# Generating code from the spec

LLM generation is not reproducible, even from the same spec. So codegen is
not a build step: it is an ordinary commit that went through review.

| | Regenerate | Generate once, then own |
|---|---|---|
| Edited | only the spec | spec and code, each in its role |
| Where | `generated/` (header `GENERATED — DO NOT EDIT`) | `src/` |
| Suits | deterministic part: DTOs, machines, tables, signatures, test skeletons | business logic, everything else |
| Breaks when | someone hand-edits a generated file | spec and code drift apart |

Use *generate once, then own* for the whole and *regenerate* only for the
deterministic subset. Generated and hand-written code never share a file.
The plugin refuses edits under `generated/`; change the generator template or
the spec, then regenerate.

## Generator

Deterministic templates (Jinja2, Tera, Handlebars) over the YAML/JSON spec
produce 60–80 % of the volume. Write your own small generator; it is easier to
control than a foreign one.

## Order and batch size

1. Work module by module in dependency order: data models → business logic →
   UI. After each module, build and run its tests; if they fail, revert the
   module and retry before moving on.
2. Generate the deterministic skeleton of the whole module (no LLM).
3. For each rule separately, give the agent **only** that rule's YAML, the
   function signature and its tests. Wider context invites "improvements"
   and duplicates of existing classes.
4. Green → commit with the rule ID in the message. Red → one fix attempt,
   then a human takes it.
5. After the module: integration layer and the module's golden tests.

Every implementing function carries a comment naming its rule ID, and the row
in `traceability.md` links rule → code → test.
