// guard — legacy/ and generated/ cannot be written by Edit, Write or
// NotebookEdit in a migration project. The deny text tells the agent what
// to do instead. Bash is not watched (see CLAUDE.md).

import type { EngineInterface, On } from "claude-code";
import { decide } from "./decide";
import { isMigrationProject } from "../../shared/project";

/** `$.fs` may only be called, not passed: this hands the slice's logic the calls it needs. */
function fsOf($: EngineInterface) {
	return {
		stat: (p: string) => $.fs.stat(p),
		list: (p: string) => $.fs.list(p),
		read: (p: string) => $.fs.read(p),
		write: (p: string, t: string) => $.fs.write(p, t),
	};
}

/** The refusal for this path in this project, or `undefined` to let the call through. */
async function refusal($: EngineInterface, path: string | undefined): Promise<{ deny: string } | undefined> {
	if (!path) return undefined;
	const reason = decide(await $.session.cwd(), path);
	if (!reason || !(await isMigrationProject(fsOf($)))) return undefined;
	return { deny: reason };
}

/** A guard that cannot decide refuses: better a stopped write than a changed legacy file. */
const DENY_ON_FAILURE = "cc-reverse-spec guard failed; write refused. Retry, or check the plugin.";

export function registerGuard(on: On): void {
	on("tool.call", { tool: "Edit" }, async ($, e, next) => (await refusal($, e.file_path)) ?? next(e)).catch(($, e, next) => (next.called ? next(e) : { deny: DENY_ON_FAILURE }));
	on("tool.call", { tool: "Write" }, async ($, e, next) => (await refusal($, e.file_path)) ?? next(e)).catch(($, e, next) => (next.called ? next(e) : { deny: DENY_ON_FAILURE }));
	on("tool.call", { tool: "NotebookEdit" }, async ($, e, next) => (await refusal($, e.notebook_path)) ?? next(e)).catch(($, e, next) => (next.called ? next(e) : { deny: DENY_ON_FAILURE }));
}
