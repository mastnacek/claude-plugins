// status — the status line of a migration project: spec ✔confirmed ~inferred
// ?gap [· N untested]. Counted at session start and after a write under
// spec/ or tests/features/; never after other tool calls.

import type { EngineInterface, On } from "claude-code";
import { affectsStatus, countSpec, statusText } from "./count";
import { isMigrationProject } from "../../shared/project";
import { relativeSegments } from "./relative";

/** `$.fs` may only be called, not passed: this hands the slice's logic the calls it needs. */
function fsOf($: EngineInterface) {
	return {
		stat: (p: string) => $.fs.stat(p),
		list: (p: string) => $.fs.list(p),
		read: (p: string) => $.fs.read(p),
		write: (p: string, t: string) => $.fs.write(p, t),
	};
}

async function refresh($: EngineInterface): Promise<void> {
	try {
		if (!(await isMigrationProject(fsOf($)))) return;
		$.ui.status(statusText(await countSpec(fsOf($))));
	} catch {
		// a status line is never worth failing a session or a tool call
	}
}

/** Session start, run by the root. */
export async function startStatus($: EngineInterface): Promise<void> {
	try {
		if (!(await isMigrationProject(fsOf($)))) return;
		$.ui.status(statusText(await countSpec(fsOf($))));
	} catch (error) {
		// One line: a log row draws "\n" as "�". A failed start must not stop the others.
		$.ui.log(`status: start failed: ${String(error instanceof Error ? error.message : error).replace(/\s+/g, " ")}`);
	}
}

async function touched($: EngineInterface, path: string | undefined): Promise<boolean> {
	if (!path) return false;
	const rel = relativeSegments(await $.session.cwd(), path);
	return rel !== undefined && affectsStatus(rel.join("/"));
}

export function registerStatus(on: On): void {
	on("tool.call", { tool: "Edit" }, async ($, e, next) => {
		const ran = await next(e);
		if (ran.deny === undefined && (await touched($, e.file_path))) await refresh($);
		return ran;
	}).catch(($, e, next) => next(e));
	on("tool.call", { tool: "Write" }, async ($, e, next) => {
		const ran = await next(e);
		if (ran.deny === undefined && (await touched($, e.file_path))) await refresh($);
		return ran;
	}).catch(($, e, next) => next(e));
	on("tool.call", { tool: "NotebookEdit" }, async ($, e, next) => {
		const ran = await next(e);
		if (ran.deny === undefined && (await touched($, e.notebook_path))) await refresh($);
		return ran;
	}).catch(($, e, next) => next(e));
}
