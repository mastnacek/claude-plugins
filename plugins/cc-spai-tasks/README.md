# cc-spai-tasks

SPAI úkoly, nápady a poznámky v docs/spai/ projektu, sdílené s pi

## Install

```
/plugin marketplace add mastnacek/claude-plugins
/plugin install cc-spai-tasks@mastnacek
```

## What it does

- **Hand-edit guard.** Refuses Write, Edit, NotebookEdit and obvious Bash writes (`>`, `>>`, `tee`, `sed -i`, `cp`/`mv` into it) aimed at `docs/spai/*.md` or `.index.json`, and Bash deletes (`rm`, `git rm`, `del`, `Remove-Item`, `unlink`) of those files. SPAI records are written and deleted only by the `spai` binary (`spai add` / `spai set` / `spai delete`).

## Commands

<!-- Every command and setting, one line each. -->
