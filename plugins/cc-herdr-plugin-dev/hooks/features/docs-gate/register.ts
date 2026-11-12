// docs-gate — herdr docs before editing herdr plugin source.
//
//   tool.call {Read, Skill, Edit, Write, MultiEdit, NotebookEdit}
//       Read of the skill's files / docs/herdr, or the herdr-plugin-dev skill → docsRead = true
//       an edit of a source file inside a herdr project while docsRead is false → { deny }
//   prompt.compose   adds the rules to the system prompt, only when the session's folder is in a herdr project
//
// `docsRead` lives in the session's $.state: a new session starts with it unset (gate closed), a reload keeps it.
// Outside a herdr project (no ancestor with herdr-plugin.toml) nothing is refused and nothing is added.
// Registered before line-limit, so a refused edit never reaches it. Fail-open: a failure lets the call through.

import type { On } from "claude-code";
import { findHerdrRoot } from "../../shared/project";
import { accessOf, denyReason, PROMPT_SECTION } from "./gate";

const docsRead = { plugin: "cc-herdr-plugin-dev", key: "docsRead" } as const;

export function registerDocsGate(on: On): void {
	on("tool.call", { tool: /^(Read|Skill|Edit|Write|MultiEdit|NotebookEdit)$/ }, async ($, e, next) => {
		const access = accessOf(e.tool, e as unknown as Record<string, unknown>, await $.session.cwd());
		if (access.kind === "docs") {
			await $.state.set(docsRead, true);
		} else if (access.kind === "edit") {
			const { value } = await $.state.get(docsRead);
			if (value !== true && (await findHerdrRoot($, access.path)) !== undefined) return { deny: denyReason(access.path) };
		}
		return next(e);
	}).catch(($, e, next) => next(e)); // fail-open

	on("prompt.compose", async ($, e, next) => {
		const below = await next(e);
		if ((await findHerdrRoot($, await $.session.cwd(), true)) === undefined) return below;
		return { ...below, sections: [...below.sections, { id: "cc-herdr-plugin-dev:rules", text: PROMPT_SECTION, scope: "session" as const }] };
	}).catch(($, e, next) => next(e));
}
