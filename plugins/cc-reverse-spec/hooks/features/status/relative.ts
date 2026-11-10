// relative.ts — a path relative to the session's folder (a copy of the guard's;
// slices do not import each other).

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
