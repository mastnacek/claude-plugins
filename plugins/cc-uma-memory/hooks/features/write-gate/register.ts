// write-gate — memory changes only through approved doors. In `ask` mode the
// user sees every uma_write / uma_supersede (and every shell command that would
// change the store) before it runs; a file tool aimed at the store is always refused.
//
//   tool.call uma_write, uma_supersede  dialog → Zapsat passes, anything else is a deny
//   tool.call Write, Edit, NotebookEdit  into the store → deny (also through a symlink)
//   tool.call Bash                       a command that would change memory → the same dialog
//
// `/uma write-gate off` removes the dialog only; Write/Edit into the store stay refused.

import type { EngineInterface, On } from "claude-code";
import { atom, read } from "claude-code";
import { isBypassingBashCommand, isUmaMemoryFilePath } from "./bypass";
import { ACCEPT, FILE_DENY_REASON, NO_UI_REASON, REJECT, SUPERSEDE_TOOL, WRITE_TOOL, previewOfCommand, previewOfWrite, verdictOf } from "./dialog";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const settingsAtom = atom({ plugin: "cc-uma-memory", key: "settings" } as const, { recall: true, writeGate: "ask" } as { recall: boolean; writeGate: "ask" | "off" });

type $ = EngineInterface;

/** Asks; undefined = the user said yes, otherwise the deny. No one to ask is a no. */
async function confirm($: $, preview: string, question: string): Promise<{ deny: string } | undefined> {
	let answer: string;
	try {
		answer = await $.ui.ask(`${preview}\n\n${question}`, { options: [ACCEPT, REJECT], header: "Zápis UMA" });
	} catch {
		return { deny: NO_UI_REASON };
	}
	const verdict = verdictOf(answer);
	return verdict.ok ? undefined : { deny: verdict.reason };
}

/** Where the path really lands: itself, or the existing folder it would be created in. Undefined when unplaceable. */
async function realPathOf($: $, path: string): Promise<string | undefined> {
	try {
		const own = await $.fs.stat(path, { resolve: true });
		if (own.realPath !== undefined) return own.realPath;
	} catch {
		// Not there yet: look at its folder.
	}
	const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
	if (cut < 0) return undefined;
	try {
		const dir = await $.fs.stat(path.slice(0, cut + 1), { resolve: true });
		return dir.realPath === undefined ? undefined : `${dir.realPath.replace(/[\\/]$/, "")}/${path.slice(cut + 1)}`;
	} catch {
		return undefined;
	}
}

async function touchesStore($: $, path: unknown): Promise<boolean> {
	if (typeof path !== "string" || !path) return false;
	if (isUmaMemoryFilePath(path)) return true;
	const real = await realPathOf($, path);
	return real !== undefined && isUmaMemoryFilePath(real);
}

const isMemoryTool = (tool: string): boolean => tool === WRITE_TOOL || tool === SUPERSEDE_TOOL;

/** The text a refusal says when the gate itself fails: better a write not made than one nobody approved. */
const GATE_FAILED = "Brána zápisu do paměti UMA selhala; nezapsáno. Zkus to znovu.";

export function registerWriteGate(on: On): void {
	// One hook for all tools: the uma_* names are MCP tools, which the generated
	// matcher types know only while the server was connected at the last save,
	// and a tool.call without a matcher may be hooked once per plugin anyway.
	on("tool.call", async ($, e, next) => {
		const tool: string = e.tool;
		if (isMemoryTool(tool)) {
			if ((await read($, settingsAtom)).writeGate === "off") return next(e);
			return (await confirm($, previewOfWrite(tool, e as Record<string, unknown>), "Zapsat do paměti UMA?")) ?? next(e);
		}
		if (e.tool === "Write" || e.tool === "Edit") return (await touchesStore($, e.file_path)) ? { deny: FILE_DENY_REASON } : next(e);
		if (e.tool === "NotebookEdit") return (await touchesStore($, e.notebook_path)) ? { deny: FILE_DENY_REASON } : next(e);
		if (e.tool === "Bash" && isBypassingBashCommand(e.command)) {
			if ((await read($, settingsAtom)).writeGate === "off") return next(e);
			return (await confirm($, previewOfCommand(e.command), "Spustit příkaz?")) ?? next(e);
		}
		return next(e);
	}).catch(($, e, next) => (next.called ? next(e) : isMemoryTool(String(e.tool)) ? { deny: GATE_FAILED } : next(e)));
}
