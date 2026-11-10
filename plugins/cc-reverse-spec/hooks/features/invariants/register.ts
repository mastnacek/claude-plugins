// invariants — spec/invariants.md goes into the system prompt of a migration
// project (spec/rules/ exists), so every session starts with the rules that
// must hold everywhere. Elsewhere: untouched.

import type { EngineInterface, On } from "claude-code";
import { isMigrationProject } from "../../shared/project";
import { buildSection } from "./section";

/** `$.fs` may only be called, not passed: this hands the slice's logic the calls it needs. */
function fsOf($: EngineInterface) {
	return {
		stat: (p: string) => $.fs.stat(p),
		list: (p: string) => $.fs.list(p),
		read: (p: string) => $.fs.read(p),
		write: (p: string, t: string) => $.fs.write(p, t),
	};
}

export function registerInvariants(on: On): void {
	on("prompt.compose", async ($, e, next) => {
		const below = await next(e);
		if (!(await isMigrationProject(fsOf($)))) return below;
		const text = await fsOf($).read("spec/invariants.md").catch(() => "");
		const section = buildSection(text);
		return section ? { ...below, sections: [...below.sections, section] } : below;
	});
}
