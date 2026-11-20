---
id: 01M75VKZK7YYCJ73NB5EC5S4TT
scope: "project:claude-plugins"
type: note
title: "Resolved (0.12.2): the write-gate judges only file operands, not expression text"
tags:
  - cc-uma-memory
  - write-gate
  - resolved
status: stable
supersedes: 01M75V12M15P6A0KTVX12KS1H0
generated:
  by: pi-agent/1.1
  at: "2026-11-11T17:48:46.567517466+00:00"
since: "2026-11-11T01:44:20.754946652+00:00"
---
The task from 2026-11-11 (false alarms of the write-gate on sed/cp commands that only mention the `.uma/` path in their text) is resolved in cc-uma-memory 0.12.2 (commit 49b448b).

For mutating utilities (sed, cp, mv, install, rsync, ln, tee, rm, touch, chmod, chown, chgrp, truncate, dd) `bypass.ts` treats only file operands as targets: a sed expression, a cp source and option values are not judged; the tokenizer respects quotes. Still caught: `sed -i` on a file in the store, the `w` command inside a sed expression, the target of cp/mv/install/rsync/ln, the source of mv, tee, rm, `dd of=`, redirections, and the same inside wrappers (`bash -c`, `sudo`) and heredocs. Utilities without a parser (python, node, perl, cmd, PowerShell) are judged as before (all arguments).

Unchanged: the gate judges by the spelling of the path, so a symlink to the store, a variable in the path or a script in a file still pass (Pitfalls in the write-gate slice CLAUDE.md).