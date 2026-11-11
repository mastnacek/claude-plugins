// write-gate — memory changes only through approved doors. In `ask` mode the
// user sees every uma_write / uma_supersede (and every shell command that would
// change the store) before it runs; a file tool aimed at the store is always refused.
//
//   tool.call uma_write, uma_supersede  step dialog ($.ui.ask): preview → approve / edit / scope / reject;
//                                        approve passes the edited input, anything else is a deny
//   tool.call Write, Edit, NotebookEdit  into the store → deny (also through a symlink)
//   tool.call Bash                       a command that would change memory → yes/no dialog
//
// `/uma write-gate off` removes the dialog only; Write/Edit into the store stay refused.
//
// Why $.ui.ask and not a strip/pane with buttons: a tool.call hook has a budget of
// its OWN time (10 s) that runs while it waits for its own Promise and pauses only
// inside calls on `$` — a press handler can never resolve it in time. $.ui.ask is
// such a call, so a person may take as long as they like.

import type { EngineInterface, On } from "claude-code";
import { atom, read } from "claude-code";
import { isBypassingBashCommand, isUmaMemoryFilePath } from "./bypass";
import { ACCEPT_RUN, DENIED_REASON, FILE_DENY_REASON, NO_UI_REASON, REJECT_RUN, SUPERSEDE_TOOL, WRITE_TOOL, optionOf, previewOfCommand, verdictOf } from "./dialog";
import { APPROVE, BACK, BACK_FULL, DONE, EDIT, HEADER, PICK_BODY, PICK_FULL, PICK_TAGS, PICK_TITLE, REJECT, approvedInput, fieldQuestion, fullTextQuestion, normalizeScope, previewOf, scopeOption, tagsOf, toggleScope, withField } from "./proposal";
import type { EditField, Proposal } from "./proposal";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const settingsAtom = atom({ plugin: "cc-uma-memory", key: "settings" } as const, { recall: true, writeGate: "ask", append: true } as { recall: boolean; writeGate: "ask" | "off"; append: boolean }, { shape: "settings-2" });

type $ = EngineInterface;


/** Asks; undefined = the user said yes, otherwise the deny. No one to ask is a no. */
async function confirm($: $, question: string, accept: string, reject: string): Promise<{ deny: string } | undefined> {
	let answer: string;
	try {
		answer = await $.ui.ask(question, { options: [accept, reject] });
	} catch {
		return { deny: NO_UI_REASON };
	}
	const verdict = verdictOf(optionOf(answer, [accept, reject]), accept, reject);
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

/** Whether the reviewed input differs from what the model sent (title, body, tags, scope). */
function isEdited(input: Record<string, unknown>, reviewed: Record<string, unknown>): boolean {
	return ["title", "body", "tags", "scope"].some((k) => JSON.stringify(input[k]) !== JSON.stringify(reviewed[k]));
}

/** What the model is told when the user changed its proposal before approving it. */
function editedNote(input: Record<string, unknown>, reviewed: Record<string, unknown>): string {
	const changed = ["title", "body", "tags", "scope"]
		.filter((k) => JSON.stringify(input[k]) !== JSON.stringify(reviewed[k]))
		.map((k) => `${k}: ${JSON.stringify(reviewed[k])}`);
	return `Uživatel návrh před uložením upravil; do paměti UMA se zapsalo: ${changed.join(", ")}.`;
}

const isMemoryTool = (tool: string): boolean => tool === WRITE_TOOL || tool === SUPERSEDE_TOOL;

/** The text a refusal says when the gate itself fails: better a write not made than one nobody approved. */
const GATE_FAILED = "Brána zápisu do paměti UMA selhala; nezapsáno. Zkus to znovu.";

/** One step of the dialog: the answer, or undefined when nobody can answer (dismissed, `-p`). */
async function ask($: $, question: string, options: string[]): Promise<string | undefined> {
	try {
		return optionOf(await $.ui.ask(question, { options, header: HEADER }), options);
	} catch {
		return undefined;
	}
}

/** The edit menu → one field (or the full text) → back; returns the proposal as changed. Dismissed = no change. */
async function editMenu($: $, v: Proposal): Promise<Proposal> {
	const pick = await ask($, `✏️ Co upravit?\n\n${previewOf(v)}`, [PICK_TITLE, PICK_BODY, PICK_TAGS, PICK_FULL]);
	if (pick === PICK_FULL) {
		await ask($, fullTextQuestion(v), [BACK_FULL, DONE]);
		return v;
	}
	const field: EditField | undefined = pick === PICK_TITLE ? "title" : pick === PICK_BODY ? "body" : pick === PICK_TAGS ? "tags" : undefined;
	if (field === undefined) return v;
	const typed = await ask($, fieldQuestion(v, field), [BACK, DONE]);
	return typed === undefined || typed === BACK || typed === DONE ? v : withField(v, field, typed);
}

/** The dialog in steps for an uma_write / uma_supersede; the (edited) input, or the deny. */
async function review($: $, tool: string, input: Record<string, unknown>): Promise<Record<string, unknown> | { deny: string }> {
	const cwd = await $.session.cwd();
	const projectName = cwd.split(/[\\/]/).filter(Boolean).pop() || "project";
	const str = (x: unknown): string => (typeof x === "string" ? x : "");
	const scope = normalizeScope(str(input.scope), projectName);
	let v: Proposal = {
		title: str(input.title),
		body: str(input.body),
		tags: tagsOf(input.tags),
		type: str(input.type),
		scope,
		initialScope: scope,
		projectName,
		supersedes: tool === SUPERSEDE_TOOL ? str(input.oldId) || "(chybí ID)" : null,
		since: str(input.since),
		staleAfter: str(input.staleAfter),
		template: str(input.template),
	};
	for (;;) {
		const answer = await ask($, previewOf(v), [APPROVE, EDIT, scopeOption(v), REJECT]);
		if (answer === undefined) return { deny: NO_UI_REASON };
		if (answer === APPROVE) return approvedInput(input, v);
		if (answer === REJECT) return { deny: DENIED_REASON };
		if (answer === EDIT) v = await editMenu($, v);
		else if (answer === scopeOption(v)) v = { ...v, scope: toggleScope(v.scope, v.projectName) };
		else return { deny: `Uživatel zápis do paměti UMA zamítl a napsal: ${answer.slice(0, 300)}` };
	}
}

export function registerWriteGate(on: On): void {
	// One hook for all tools: the uma_* names are MCP tools, which the generated
	// matcher types know only while the server was connected at the last save,
	// and a tool.call without a matcher may be hooked once per plugin anyway.
	on("tool.call", async ($, e, next) => {
		const tool: string = e.tool;
		if (isMemoryTool(tool)) {
			if ((await read($, settingsAtom)).writeGate === "off") return next(e);
			const input = e as Record<string, unknown>;
			const reviewed = await review($, tool, input);
			if ("deny" in reviewed && typeof reviewed.deny === "string") return { deny: reviewed.deny };
			if (!isEdited(input, reviewed)) return next(e);
			// Edited: a fresh call with the new input, so the permission check (auto
			// mode's classifier) reviews what will really run. Rewriting `e` through
			// `next` is refused: "a hook changed this call's input after auto mode
			// reviewed it". The plugin's own frame skips this hook on the new call.
			const { tool_use_id: _id, consent: _consent, ...args } = reviewed as Record<string, unknown>;
			const done = await $.tool.call(args as never);
			if (done.deny !== undefined) return done;
			return { ...done, context: [...(done.context ?? []), editedNote(input, reviewed)] };
		}
		if (e.tool === "Write" || e.tool === "Edit") return (await touchesStore($, e.file_path)) ? { deny: FILE_DENY_REASON } : next(e);
		if (e.tool === "NotebookEdit") return (await touchesStore($, e.notebook_path)) ? { deny: FILE_DENY_REASON } : next(e);
		if (e.tool === "Bash" && isBypassingBashCommand(e.command)) {
			if ((await read($, settingsAtom)).writeGate === "off") return next(e);
			return (await confirm($, previewOfCommand(e.command), ACCEPT_RUN, REJECT_RUN)) ?? next(e);
		}
		return next(e);
	}).catch(($, e, next) => (next.called ? next(e) : isMemoryTool(String(e.tool)) ? { deny: GATE_FAILED } : next(e)));
}
