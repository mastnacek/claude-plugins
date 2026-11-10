# Invariants

<!-- Injected into every Claude Code session by cc-reverse-spec. Keep it short:
     only what must hold everywhere, always. -->

- Money is `Decimal`, never float. Rounding: see BR-XXX-000.
- Domain terms keep their original names (see `spec/domain/glossary.md`).
- `legacy/` is read-only; `generated/` is only written by the generator.
- New behaviour needs a rule in `spec/rules/` first.
- One rule per task; every commit names the rule ID.
- Unsure → a line in `spec/questions.md`, not a guess in code.
- Parity before fixes: keep `@legacy-bug` behaviour until cutover.
