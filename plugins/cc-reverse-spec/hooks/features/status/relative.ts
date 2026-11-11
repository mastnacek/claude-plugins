// relative.ts — a path relative to the session's folder (a copy of the guard's;
// slices do not import each other).

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
