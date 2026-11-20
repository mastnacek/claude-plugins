// guard-spai-files — SPAI records are written only by the `spai` binary. A file tool aimed
// (MultiEdit is not hooked: this engine build does not know the tool, the matcher fails tsc)
// at docs/spai/*.md (or .index.json), or a shell command that obviously writes there, is refused.

import type { On } from "claude-code";
import { decide } from "./decide";

export function registerGuardSpaiFiles(on: On): void {
	on("tool.call", { tool: "Write" }, async (_$, e, next) => { const reason = decide("Write", e); return reason ? { deny: reason } : next(e); });
	on("tool.call", { tool: "Edit" }, async (_$, e, next) => { const reason = decide("Edit", e); return reason ? { deny: reason } : next(e); });
	on("tool.call", { tool: "NotebookEdit" }, async (_$, e, next) => { const reason = decide("NotebookEdit", e); return reason ? { deny: reason } : next(e); });
	on("tool.call", { tool: "Bash" }, async (_$, e, next) => { const reason = decide("Bash", e); return reason ? { deny: reason } : next(e); });
}
