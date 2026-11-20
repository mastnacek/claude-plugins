---
type: Note
title: "agent.sh puts D:/01_programovani/_tools first in PATH and sets SPAI_BIN for every agent"
timestamp: 2026-11-20 15:56:04
status: done
source: orchestrator
tags: [workflow]
facets:
  project: claude
  project_path: D:/01_programovani/claude
spai_symbol: 'x'
lang: en
title_cs: "agent.sh dává D:/01_programovani/_tools na první místo v PATH a nastavuje SPAI_BIN pro každého agenta"
done_evidence: "cf7488f"
---

# SPAI-010: agent.sh puts D:/01_programovani/_tools first in PATH and sets SPAI_BIN for every agent

x agent.sh puts D:/01_programovani/_tools first in PATH and sets SPAI_BIN for every agent @claude :workflow:

Source: agy observer, 2026-11-20 15:48 (verified in the anon-mask transcript: the coder hit Permission denied twice from ~/.cargo/bin/spai.exe because the herdr pane inherited the old PATH; the spai() function in next.sh does not reach agent panes).

## Log
- 2026-11-20 15:56 (orchestrator) done: cf7488f
