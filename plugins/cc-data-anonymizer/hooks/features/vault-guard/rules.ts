// rules.ts — pure: decides whether a tool call touches the anon home (vault, key, map, rules)
// or runs anon in a way that reveals or changes what it keeps. No I/O; the caller hands in the
// environment. Every doubt is a deny: a false positive costs the person one "!" command.

/** What the decision needs from the session. */
export type Guard = {
	/** The folders that count as the anon home, each as lower-case path components. */
	homes: string[][];
	/** The session directory (for relative paths). */
	cwd: string;
	/** Environment variables the session has. */
	vars: Record<string, string | undefined>;
};

const norm = (s: string) => s.replace(/\\/g, "/");

function splitParts(path: string): string[] {
	const out: string[] = [];
	for (const c of norm(path).split("/")) {
		if (c === "" || c === ".") continue;
		if (c === "..") out.pop();
		else out.push(c.toLowerCase());
	}
	return out;
}

const WILD = /[*?[{]/;
const SCHEME = /^[a-z][a-z0-9+.-]+:\/\//i;
const DRIVE = /^\/(?:mnt\/)?([a-z])(?=\/|$)/i;

/** Replaces %NAME%, $env:NAME, $NAME and the braced form for variables the session has; a name before "=" stays. */
export function expandVars(text: string, vars: Record<string, string | undefined>): string {
	const lower = new Map(Object.entries(vars).map(([k, x]) => [k.toLowerCase(), x]));
	const val = (name: string) => lower.get(name.toLowerCase())?.trim() || undefined;
	const re = /%([A-Za-z_]+)%|\$env:([A-Za-z_]+)(?!\w)(\s*=)?|\$\{([A-Za-z_]+)\}|\$([A-Za-z_]+)(?!\w)(\s*=)?/g;
	return text.replace(re, (m, a, b, bEq, c, d, dEq) => {
		if (bEq || dEq) return m;
		return val(a ?? b ?? c ?? d) ?? m;
	});
}

/** Path → lower-case components, absolute: ~ and variables expanded, relative joined to cwd, .. resolved. */
export function pathParts(path: string, g: Pick<Guard, "cwd" | "vars">): string[] | null {
	let s = path.trim();
	if (!s) return null;
	if (/^file:\/\//i.test(s)) s = s.replace(/^file:\/\/(localhost)?\/?/i, "");
	else if (SCHEME.test(s)) return null;
	s = norm(expandVars(s, g.vars)).replace(/^\/\/\?\//, "");
	const homeDir = g.vars.HOME?.trim() || g.vars.USERPROFILE?.trim();
	if (homeDir && /^~(\/|$)/.test(s)) s = norm(homeDir) + s.slice(1);
	s = s.replace(DRIVE, "$1:");
	if (!/^[a-z]:(\/|$)/i.test(s) && !s.startsWith("/")) s = norm(g.cwd).replace(DRIVE, "$1:") + "/" + s;
	return splitParts(s);
}

/** Home candidates from the environment: ANON_HOME and every platform default whose base is set. */
export function homesOf(vars: Record<string, string | undefined>, cwd = "/"): string[][] {
	const v = (k: string) => vars[k]?.trim() || undefined;
	const raw: string[] = [];
	if (v("ANON_HOME")) raw.push(v("ANON_HOME")!);
	if (v("APPDATA")) raw.push(norm(v("APPDATA")!) + "/anon");
	const home = v("HOME") ?? v("USERPROFILE");
	if (home) raw.push(norm(home) + "/Library/Application Support/anon");
	const xdg = v("XDG_CONFIG_HOME") ?? (home ? norm(home) + "/.config" : undefined);
	if (xdg) raw.push(norm(xdg) + "/anon");
	const plain = { cwd, vars: { ...vars, ANON_HOME: undefined } };
	return raw.map((r) => pathParts(r, plain)).filter((p): p is string[] => p !== null && p.length > 0);
}

// A Windows 8.3 short name ("JAROSL~1") matches a long component that starts with its prefix.
function same(c: string, h: string): boolean {
	if (c === h) return true;
	const m = /^(.{1,6})~\d+$/.exec(c);
	if (!m) return false;
	const strip = (x: string) => x.replace(/[^a-z0-9]/g, "");
	const prefix = strip(m[1]!);
	return prefix.length > 0 && strip(h).startsWith(prefix);
}

const inside = (p: string[], home: string[]) => p.length >= home.length && home.every((h, i) => same(p[i]!, h));
const above = (p: string[], home: string[]) => p.length < home.length && p.every((c, i) => same(c, home[i]!));

/** Is the path in the anon home — or, with includeAbove, a folder that holds it (or a wildcard that may reach it)? */
export function hitsHome(path: string, g: Guard, includeAbove: boolean): boolean {
	let s = path;
	const w = WILD.exec(s);
	if (w) {
		const cut = norm(s.slice(0, w.index));
		s = cut.slice(0, cut.lastIndexOf("/") + 1) || "/";
		includeAbove = true;
	}
	const p = pathParts(s, g);
	if (!p) return false;
	return g.homes.some((h) => inside(p, h) || (includeAbove && above(p, h)));
}

// --- tools with a path -------------------------------------------------------------------

// Keys that hold text to write or say, never a place to read.
const SKIP_KEYS = new Set(["tool", "tool_use_id", "content", "new_string", "old_string", "new_source", "old_source", "text", "prompt", "description", "command"]);
const PATH_KEY = /(^|_|-)(path|paths|file|files|dir|dirs|directory|folder|root|cwd|uri|source|target|dest|destination)$/i;

function strings(v: unknown, depth = 0): string[] {
	if (typeof v === "string") return [v];
	if (depth > 3 || v === null || typeof v !== "object") return [];
	return Object.values(v).flatMap((x) => strings(x, depth + 1));
}

/** Why the call must be denied, or null. The input is the tool.call event. */
export function checkInput(input: Record<string, unknown>, g: Guard): string | null {
	const tool = String(input.tool ?? "");
	const searches = tool === "Grep" || tool === "Glob";
	if (searches) {
		const root = typeof input.path === "string" && input.path ? input.path : g.cwd;
		if (hitsHome(root, g, true)) return "a search over the folder that holds the anon vault and map";
	}
	for (const [key, value] of Object.entries(input)) {
		if (SKIP_KEYS.has(key)) continue;
		if (!(PATH_KEY.test(key) || (tool === "Glob" && key === "pattern"))) continue;
		for (const s of strings(value)) {
			if (hitsHome(s, g, searches)) return "the anon vault, key, map or rules";
		}
	}
	if (typeof input.command === "string") return checkShell(input.command, g);
	return null;
}

// --- shell commands ----------------------------------------------------------------------

const DPAPI = /unprotect|cryptunprotectdata|protecteddata|dpapi/i;
const SECRET_FILES = new Set(["vault.bin", "vault.key", "map.db"]);
const DENIED_ARGS = new Set(["unmask", "map", "vault", "tui", "rules", "import", "export", "reveal"]);
const SAFE_FIRST = new Set(["help", "--help", "-h", "--version", "-v"]);
const WRAPPERS = new Set(["env", "command", "exec", "sudo", "time", "nohup", "call", "start", "start-process", "cmd", "xargs", "builtin"]);
const SEPARATOR = /[;|&\n\r\x60(){}<>]/;

type Parsed = { segments: string[][]; inner: string[] };

/** Splits a command line into segments of words; the text of a quoted word with spaces is kept to be read again. */
export function tokenize(text: string): Parsed {
	const segments: string[][] = [];
	const inner: string[] = [];
	let words: string[] = [];
	let word = "";
	let has = false;
	let quote = "";
	let quoted = "";
	const endWord = () => {
		if (has) words.push(word);
		word = "";
		has = false;
	};
	const endSegment = () => {
		endWord();
		if (words.length) segments.push(words);
		words = [];
	};
	for (const ch of text) {
		if (quote) {
			if (ch === quote) {
				if (/\s/.test(quoted)) inner.push(quoted);
				quote = "";
				quoted = "";
			} else {
				word += ch;
				quoted += ch;
			}
		} else if (ch === "'" || ch === '"') {
			quote = ch;
			has = true;
		} else if (/\s/.test(ch)) endWord();
		else if (SEPARATOR.test(ch)) endSegment();
		else {
			word += ch;
			has = true;
		}
	}
	endSegment();
	return { segments, inner };
}

const baseName = (w: string) => norm(w).split("/").pop()!.toLowerCase();
const stem = (w: string) => baseName(w).replace(/\.(exe|cmd|bat)$/, "");
const isAssignment = (w: string) => /^\$?(env:)?[A-Za-z_]\w*=/.test(w) || /^(set|export|setx)$/i.test(w);

function argReason(args: string[]): string | null {
	const toks = args
		.flatMap((a) => a.toLowerCase().split(/[\s,]+/))
		.map((t) => t.replace(/^[@('"]+|[)'"]+$/g, ""))
		.filter(Boolean);
	if (toks.length && SAFE_FIRST.has(toks[0]!)) return null;
	for (const t of toks) {
		if (t.startsWith("--with-values") || t.startsWith("--reveal") || t === "-reveal") return "anon with an option that shows original values";
		if (DENIED_ARGS.has(t)) return "an anon command that shows originals or changes the vault, map or rules";
	}
	return null;
}

function checkSegment(words: string[], names: Set<string>): string | null {
	let i = 0;
	const skipAssignments = () => {
		while (i < words.length && isAssignment(words[i]!)) i++;
	};
	skipAssignments();
	while (i < words.length && WRAPPERS.has(words[i]!.toLowerCase())) {
		i++;
		while (i < words.length && /^[-/]/.test(words[i]!) && words[i]!.length < 20) i++;
		skipAssignments();
	}
	const cmd = words[i];
	return cmd !== undefined && names.has(stem(cmd)) ? argReason(words.slice(i + 1)) : null;
}

/** Why a Bash/PowerShell command must be denied, or null. */
export function checkShell(command: string, g: Guard, depth = 0): string | null {
	if (DPAPI.test(command)) return "a call to DPAPI, which unlocks the vault key";
	const text = expandVars(command, g.vars);
	const { segments, inner } = tokenize(text);
	const names = new Set(["anon"]);
	if (g.vars.ANON_BIN?.trim()) names.add(stem(g.vars.ANON_BIN));
	const literal = norm(text).toLowerCase().replace(/\/{2,}/g, "/");
	for (const h of g.homes) {
		const joined = h.join("/");
		if (literal.includes(joined) || literal.includes("/" + joined.replace(":", ""))) return "a path in the anon home";
	}
	for (const seg of segments) {
		for (const w of seg) {
			for (const piece of w.split(/[=,]/)) {
				if (!piece) continue;
				if (SECRET_FILES.has(baseName(piece))) return "a vault, key or map file of anon";
				if (hitsHome(piece, g, false)) return "a path in the anon home";
			}
		}
		// Join-Path $env:APPDATA 'anon': the folder above the home and its name as separate words.
		for (const h of g.homes) {
			const parent = h.slice(0, -1);
			const last = h[h.length - 1]!;
			const hasParent = seg.some((w) => {
				const p = pathParts(w, g);
				return p !== null && p.length === parent.length && parent.every((c, k) => same(p[k]!, c));
			});
			if (hasParent && seg.some((w) => norm(w).replace(/^\/+|\/+$/g, "").toLowerCase() === last)) return "a path in the anon home";
		}
		const bad = checkSegment(seg, names);
		if (bad) return bad;
	}
	if (depth < 3) {
		for (const s of inner) {
			const bad = checkShell(s, g, depth + 1);
			if (bad) return bad;
		}
	}
	return null;
}
