// decide.ts — may a write tool touch this path? Pure: no disk, no engine.

const REASONS: Record<string, string> = {
	legacy: "legacy/ is a read-only oracle; record behaviour in spec/ or tests/ instead.",
	generated: "generated/ is written by the generator; change the generator template or the spec, then regenerate.",
};

/** Backslashes to `/`, so one splitter serves Windows and POSIX spellings. */
const slashed = (path: string): string => path.replace(/\\/g, "/");

/** `X:` at the start; Windows paths do not care about its case. */
const DRIVE = /^([A-Za-z]):(?=\/|$)/;

/** Resolves `.` and `..`; `undefined` when `..` climbs above the root. A drive letter is lower-cased, the rest stays as written. */
function segments(path: string): string[] | undefined {
	const out: string[] = [];
	for (const part of slashed(path).replace(DRIVE, (_, d: string) => `${d.toLowerCase()}:`).split("/")) {
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
	const path = slashed(filePath);
	const drive = DRIVE.exec(slashed(cwd))?.[0] ?? "";
	// `\x` (rooted, no drive) means the cwd's drive on Windows.
	const full = segments(DRIVE.test(path) ? path : path.startsWith("/") ? `${drive}${path}` : `${cwd}/${path}`);
	const root = segments(cwd);
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
