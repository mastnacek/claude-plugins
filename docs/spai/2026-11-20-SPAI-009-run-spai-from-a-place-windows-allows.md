---
type: Todo
title: "Run spai from a place Windows allows: ~/.cargo/bin/spai.exe is now refused (access denied)"
timestamp: 2026-11-20 15:44:29
status: done
source: orchestrator
tags: [workflow, spai]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "Spusťte spai z místa, které Windows povoluje: ~/.cargo/bin/spai.exe je nyní zamítnuto (přístup odepřen)"
done_evidence: "user set SPAI_BIN and PATH (D:/01_programovani/_tools first) 2026-11-20; spai docs updated"
---

# SPAI-009: Run spai from a place Windows allows: ~/.cargo/bin/spai.exe is now refused (access denied)

x Run spai from a place Windows allows: ~/.cargo/bin/spai.exe is now refused (access denied) @claude :workflow:spai:

Source: orchestrator, 2026-11-20 15:40. Same as gitleaks and jq: new unsigned executables under the user profile are refused, D:\ works. Copy at D:/01_programovani/_tools/spai.exe; sidebar, kanban and pi-spai need SPAI_BIN or PATH pointing there.

## Log
- 2026-11-20 15:50 (orchestrator) done: user set SPAI_BIN and PATH (D:/01_programovani/_tools first) 2026-11-20; spai docs updated
