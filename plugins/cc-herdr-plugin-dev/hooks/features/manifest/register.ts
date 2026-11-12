// manifest — the `herdr_validate_manifest` tool: checks a herdr-plugin.toml against the herdr plugin rules.
//
//   start (root, session.start)         registers the tool
//   tool.call herdr_validate_manifest   reads the manifest through shared/actions, answers the model with errors and warnings

import type { EngineInterface, On } from "claude-code";
import { validateAt } from "../../shared/actions";
import { answerText } from "./policy";

const TOOL = "herdr_validate_manifest";

const DESCRIPTION =
	"Validate a herdr-plugin.toml (or the folder holding it) against the herdr plugin rules: required fields, id formats, " +
	"unique local ids, argv commands, pane placement, link-handler actions. Returns the list of errors and warnings.";

const INPUT_SCHEMA = {
	type: "object",
	properties: { path: { type: "string", description: "Path to herdr-plugin.toml or to the folder containing it." } },
	required: ["path"],
} as const;

export function registerManifest(on: On): void {
	on("tool.call", { tool: /(^|__)herdr_validate_manifest$/ }, async ($, e) => {
		const path = typeof (e as unknown as { path?: unknown }).path === "string" ? ((e as unknown as { path: string }).path.trim()) : "";
		const text = path === "" ? "Missing 'path'." : answerText(await validateAt($, path));
		return { result: text, text } as never;
	});
}

/** Session start, run by the root. */
export async function startManifest($: EngineInterface): Promise<void> {
	await $.tool.register({ name: TOOL, description: DESCRIPTION, inputSchema: INPUT_SCHEMA as unknown as Record<string, unknown>, isDeferred: false });
}
