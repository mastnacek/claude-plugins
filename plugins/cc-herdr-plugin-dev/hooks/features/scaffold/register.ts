// scaffold — the `herdr_scaffold_plugin` tool: a starter herdr plugin (rust | typescript | bash) written to a folder.
//
//   start (root, session.start)        registers the tool
//   tool.call herdr_scaffold_plugin    writes the project through shared/actions, answers the model with the file list

import type { EngineInterface, On } from "claude-code";
import { scaffoldPlugin } from "../../shared/actions";
import { LANGUAGES } from "../../shared/scaffold";
import type { Language } from "../../shared/scaffold";

const TOOL = "herdr_scaffold_plugin";

const DESCRIPTION =
	"Generate a starter herdr plugin project (herdr-plugin.toml plus sources) in Rust (default for herdr plugins, Ratatui + VSA), TypeScript or Bash. " +
	"Refuses to overwrite an existing herdr-plugin.toml. Read the herdr-plugin-dev skill before editing the generated sources.";

const INPUT_SCHEMA = {
	type: "object",
	properties: {
		targetDir: { type: "string", description: "Folder for the plugin (relative to the working directory, or absolute); created if missing." },
		id: { type: "string", description: "Plugin id, e.g. 'my-org.my-tool' (letters, digits, '.', ':', '_', '-')." },
		name: { type: "string", description: "Human readable name, e.g. 'My Tool'." },
		language: { type: "string", enum: [...LANGUAGES], description: "Implementation language." },
		description: { type: "string", description: "One-sentence description." },
	},
	required: ["targetDir", "id", "name", "language"],
} as const;

const answer = (text: string) => ({ result: text, text }) as never;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function registerScaffold(on: On): void {
	// The full name carries the plugin's prefix (`mcp__<plugin>__herdr_scaffold_plugin`).
	on("tool.call", { tool: /(^|__)herdr_scaffold_plugin$/ }, async ($, e) => {
		const input = e as unknown as Record<string, unknown>;
		const dir = str(input.targetDir);
		if (dir === "") return answer("Missing 'targetDir'.");
		const language = str(input.language) as Language;
		const id = str(input.id);
		const description = str(input.description);
		const done = await scaffoldPlugin($, dir, { id, name: str(input.name) || id, language, ...(description ? { description } : {}) });
		if ("error" in done) return answer(`Scaffold failed: ${done.error}`);
		return answer(`Created herdr plugin '${id}' (${language}) in ${dir}. Files:\n- ${done.files.join("\n- ")}\n\nNext: cd ${dir} && herdr plugin link .`);
	});
}

/** Session start, run by the root. */
export async function startScaffold($: EngineInterface): Promise<void> {
	await $.tool.register({ name: TOOL, description: DESCRIPTION, inputSchema: INPUT_SCHEMA as unknown as Record<string, unknown>, isDeferred: false });
}
