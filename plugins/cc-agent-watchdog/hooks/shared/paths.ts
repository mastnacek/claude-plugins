// paths.ts — path handling that works for POSIX and Windows spellings.
// Everything is brought to `/` separators with the drive letter dropped before
// it is compared; symlinks are not resolved (no realpath inside the engine).

/** `C:\a\b` → `/a/b`. */
export const canon = (p: string): string => p.replace(/\\/g, "/").replace(/^[A-Za-z]:(?=\/|$)/, "");

/** Absolute, `~` and `$HOME` expanded, `.` and `..` collapsed. */
export function resolvePath(p: string, cwd: string, home: string): string {
	let path = canon(p.trim());
	path = path.replace(/^(\$HOME|\$\{HOME\}|~)(?=\/|$)/, canon(home));
	if (!path.startsWith("/")) path = `${canon(cwd)}/${path}`;
	const parts: string[] = [];
	for (const part of path.split("/")) {
		if (part === "" || part === ".") continue;
		if (part === "..") parts.pop();
		else parts.push(part);
	}
	return `/${parts.join("/")}`;
}

/** `path` is `dir` or lies inside it. */
export const under = (path: string, dir: string): boolean => dir === "/" || path === dir || path.startsWith(`${dir}/`);

const escape = (s: string): string => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/** `pattern` (with `*` and `**`, `~`, relative to `base`) covers `path`: the path itself or anything under it. */
export function matches(path: string, pattern: string, base: string, home: string): boolean {
	const glob = (s: string) =>
		s
			.split("**")
			.map((chunk) => chunk.split("*").map(escape).join("[^/]*"))
			.join(".*");
	// `**/name` matches the name at any depth, the top level included.
	if (pattern.startsWith("**/")) return new RegExp(`^(?:.*/)?${glob(pattern.slice(3))}(/.*)?$`).test(path);
	return new RegExp(`^${glob(resolvePath(pattern, base, home))}(/.*)?$`).test(path);
}

export const matchesAny = (path: string, patterns: readonly string[], base: string, home: string): boolean => patterns.some((p) => matches(path, p, base, home));

export const baseName = (p: string): string => canon(p).replace(/\/+$/, "").split("/").pop() ?? "";
