// decide.ts — may a write tool touch this path? Pure: no disk, no engine.

const REASONS: Record<string, string> = {
	legacy: "legacy/ is a read-only oracle; record behaviour in spec/ or tests/ instead.",
	generated: "generated/ is written by the generator; change the generator template or the spec, then regenerate.",
};

/** Resolves `.` and `..`; `undefined` when `..` climbs above the root. */
function segments(path: string): string[] | undefined {
	const out: string[] = [];
	for (const part of path.split("/")) {
		if (part === "" || part === ".") continue;
		if (part === "..") {
			if (out.length === 0) return undefined;
			out.pop();
		} else out.push(part);
	}
	return out;
}

/** The path relative to `cwd` as segments, or `undefined` when it lies outside. */
export function relativeSegments(cwd: string, filePath: string): string[] | undefined {
	const root = segments(cwd);
	const full = segments(filePath.startsWith("/") ? filePath : `${cwd}/${filePath}`);
	if (!root || !full || full.length < root.length) return undefined;
	if (root.some((part, i) => full[i] !== part)) return undefined;
	return full.slice(root.length);
}

/** The reason to refuse, or `null` when the write is allowed. */
export function decide(cwd: string, filePath: string): string | null {
	const rel = relativeSegments(cwd, filePath);
	if (!rel || rel.length < 2) return null; // outside the project, or a file named legacy at the root
	const reason = REASONS[rel[0] ?? ""];
	return reason ? `${reason} (${rel.join("/")})` : null;
}
