// gate.ts — what a tool call means for the docs gate. Pure; no `$`.

import { absolute, isHerdrDocsPath, isSourcePath } from "../../shared/project";

export type Access =
	| { kind: "docs" } // the call reads the skill / herdr docs: the gate opens
	| { kind: "edit"; path: string } // the call edits a source file: the gate may refuse
	| { kind: "other" };

const SKILL = /(^|:)herdr-plugin-dev$/;
const EDITS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function accessOf(tool: string, input: Record<string, unknown>, cwd: string): Access {
	if (tool === "Skill") return SKILL.test(str(input.skill).trim()) ? { kind: "docs" } : { kind: "other" };
	if (tool === "Read") return isHerdrDocsPath(absolute(str(input.file_path), cwd)) ? { kind: "docs" } : { kind: "other" };
	if (EDITS.has(tool)) {
		const raw = str(input.file_path) || str(input.notebook_path);
		const path = raw === "" ? "" : absolute(raw, cwd);
		return path !== "" && isSourcePath(path) ? { kind: "edit", path } : { kind: "other" };
	}
	return { kind: "other" };
}

export function denyReason(path: string): string {
	const file = path.slice(path.lastIndexOf("/") + 1);
	return [
		`HERDR DOCS BEFORE EDIT: '${file}' je zdroják herdr pluginu, ale v tomto sezení se nečetla dokumentace herdru.`,
		"Stejnou úpravu nezkoušej znovu, zamítne se znovu.",
		"Nejdřív spusť skill herdr-plugin-dev (Skill) nebo přečti jeho SKILL.md / references (Read),",
		"případně docs/herdr/*.md v projektu; pak úpravu zopakuj.",
	].join(" ");
}

export const PROMPT_SECTION = [
	"HERDR PLUGIN PROJECT: the working directory is inside a herdr plugin project (a folder with herdr-plugin.toml).",
	"Editing its source files is refused until the herdr-plugin-dev skill (or its references) was read in this session; if an edit is refused with 'HERDR DOCS BEFORE EDIT', read it, then retry.",
	"Source files must stay at or below 400 lines (warning from 300): when an edit is reported as 'Line limit exceeded', split the file into cohesive modules in the same folder instead of retrying it unchanged.",
	"Tools: herdr_scaffold_plugin (starter project), herdr_validate_manifest; the same as /herdr-plugin scaffold|validate|docs.",
].join("\n");
