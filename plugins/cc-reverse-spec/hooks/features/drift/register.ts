// drift — /reverse-spec check: do the rules, their evidence and their tests
// still agree? Reports to the model and writes spec/confidence.md.

import type { EngineInterface, On } from "claude-code";

import { COMMAND, runDrift } from "./run";

/** Session start, run by the root. */
/** `$.fs` may only be called, not passed: this hands the slice's logic the calls it needs. */
function fsOf($: EngineInterface) {
	return {
		stat: (p: string) => $.fs.stat(p),
		list: (p: string) => $.fs.list(p),
		read: (p: string) => $.fs.read(p),
		write: (p: string, t: string) => $.fs.write(p, t),
	};
}

export async function startDrift($: EngineInterface): Promise<void> {
	await $.command.register({
		name: COMMAND,
		description: "Check the reverse-engineered spec: rules, evidence, tests",
		argumentHint: "check",
	});
}

export function registerDrift(on: On): void {
	on("command.run", { command: COMMAND }, async ($, e) => ({ text: await runDrift(fsOf($), e.args) })).catch(($, e) => ({
		text: "reverse-spec: the check failed; see the debug log.",
	}));
}
