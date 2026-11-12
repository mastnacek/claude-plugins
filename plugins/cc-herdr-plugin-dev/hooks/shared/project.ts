// project.ts — what is a herdr plugin project and which files the gates look at.
//
//   findHerdrRoot($, file)   nearest ancestor holding herdr-plugin.toml, or undefined
//   isSourcePath(path)       a monitored source file (extension list, not under node_modules/target/…)
//   isHerdrDocsPath(path)    the skill's SKILL.md / references, or a project's docs/herdr/
//   countLines(text)         physical lines; one trailing newline makes no extra line

import type { EngineInterface } from "claude-code";

type $ = EngineInterface;

export const MANIFEST = "herdr-plugin.toml";
export const MAX_FILE_LINES = 400;
export const WARN_FILE_LINES = 300;
const MAX_ANCESTOR_DEPTH = 10;

const SOURCE_EXTENSIONS = new Set([
	"ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "rs", "go", "py", "sh", "bash", "ps1",
	"css", "scss", "html", "sql", "java", "kt", "cs", "c", "h", "cpp",
]);
const EXEMPT_SEGMENTS = new Set(["node_modules", "dist", "build", "out", "coverage", "target", "vendor", ".git", ".next", "__pycache__", ".venv", "test-results"]);
const EXEMPT_FILES = new Set(["package-lock.json", "bun.lock", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json"]);

/** Forward slashes, lower-case drive letter: the spelling the checks compare. */
export const normalize = (p: string): string => p.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_m, d: string) => `${d.toLowerCase()}:`);

/** `p` made absolute against `cwd` (already-absolute paths are only normalized). */
export function absolute(p: string, cwd: string): string {
	const n = normalize(p);
	return n.startsWith("/") || /^[a-z]:\//.test(n) ? n : `${normalize(cwd).replace(/\/+$/, "")}/${n.replace(/^\.\//, "")}`;
}

export const dirname = (p: string): string => p.slice(0, Math.max(p.lastIndexOf("/"), 0)) || "/";

export function isSourcePath(path: string): boolean {
	const parts = normalize(path).split("/");
	const base = (parts[parts.length - 1] ?? "").toLowerCase();
	const ext = base.includes(".") ? base.slice(base.lastIndexOf(".") + 1) : "";
	if (!SOURCE_EXTENSIONS.has(ext) || EXEMPT_FILES.has(base)) return false;
	return !parts.some((s) => EXEMPT_SEGMENTS.has(s.toLowerCase()));
}

export function isHerdrDocsPath(path: string): boolean {
	const n = normalize(path).toLowerCase();
	return n.endsWith(".md") && (n.includes("/skills/herdr-plugin-dev/") || n.includes("/docs/herdr/"));
}

/** The herdr project root above `file` (its own folder included), or undefined. `dir` mode starts at `file` itself. */
export async function findHerdrRoot($: $, file: string, startAtDir = false): Promise<string | undefined> {
	let dir = startAtDir ? normalize(file).replace(/\/+$/, "") : dirname(normalize(file));
	for (let i = 0; i <= MAX_ANCESTOR_DEPTH; i++) {
		if (await $.fs.exists(`${dir}/${MANIFEST}`)) return dir;
		const up = dirname(dir);
		if (up === dir) return undefined;
		dir = up;
	}
	return undefined;
}

export function countLines(text: string): number {
	if (text.length === 0) return 0;
	const lines = text.split(/\r\n|\r|\n/);
	if (lines[lines.length - 1] === "") lines.pop();
	return lines.length;
}
