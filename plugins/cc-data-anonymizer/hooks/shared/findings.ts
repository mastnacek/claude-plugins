// findings.ts — pure: turns `anon scan --json` places into a per-file list
// (short paths, sorted) and picks the color of a kind. No values ever pass here:
// a finding carries kind, rule, position and length only.

import type { FileFindings, FindingLine } from "../../types";

export type Finding = FindingLine & { path: string };

/** Path relative to `cwd` when it lies below it (forward slashes), else unchanged. */
export function shortPath(path: string, cwd: string): string {
	const norm = (p: string) => p.replace(/\\/g, "/");
	const [p, base] = [norm(path), norm(cwd).replace(/\/+$/, "")];
	return base !== "" && p.toLowerCase().startsWith(base.toLowerCase() + "/") ? p.slice(base.length + 1) : p;
}

/** One entry per file (sorted by path), its lines sorted by line and column. */
export function groupByFile(findings: readonly Finding[], cwd: string): FileFindings[] {
	const files = new Map<string, FindingLine[]>();
	for (const { path, ...line } of findings) {
		const key = shortPath(path, cwd);
		files.set(key, [...(files.get(key) ?? []), line]);
	}
	return [...files.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([path, lines]) => ({ path, lines: lines.sort((a, b) => a.line - b.line || a.column - b.column) }));
}

/** Theme color of a kind: password and secret red, name yellow, e-mail blue, the rest cyan-ish. */
export function kindColor(kind: string): "error" | "warning" | "suggestion" | "permission" {
	if (kind === "password" || kind === "secret") return "error";
	if (kind === "name") return "warning";
	if (kind === "email") return "suggestion";
	return "permission";
}

/** The same list as plain text, for the question of the dialog. */
export function plainList(groups: readonly FileFindings[]): string {
	return groups
		.map(({ path, lines }) => [path, ...lines.map((l) => `  ${l.line}:${l.column}  ${l.kind}  ${l.rule}  ${l.chars} znaků${l.shown === undefined ? "" : `  ${l.shown}`}`)].join("\n"))
		.join("\n");
}
