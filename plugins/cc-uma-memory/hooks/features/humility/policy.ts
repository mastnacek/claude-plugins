// policy.ts — the pure half of the humility gate: a port of pi's
// `slices/humility/policy.ts` (flag a directory, count the reads under it, decide
// on a mutation), adapted to Claude Code where the hypothesis is not a tool call
// but a line in the model's own reply. No imports, no `$`.

/** One unfamiliar directory (a prefix of absolute paths). */
export type Flag = { dir: string; required: number; reads: string[]; confirmed: boolean };

/** Related files to read before a hypothesis counts (the MCP result carries its own `required_reads`; pi's value is the fallback). */
export const REQUIRED_READS = 3;

export type Verdict = { low: boolean; required: number };

/** The `uma_humility` result text: LOW means `familiarity` "low" and `exploration_required`, both (as in pi). Anything unreadable is not LOW. */
export function parseVerdict(text: string | undefined): Verdict {
	try {
		const v = JSON.parse(text ?? "") as Record<string, unknown>;
		const low = typeof v.familiarity === "string" && v.familiarity.toLowerCase() === "low" && v.exploration_required === true;
		const n = typeof v.required_reads === "number" && Number.isInteger(v.required_reads) ? v.required_reads : REQUIRED_READS;
		return { low, required: Math.min(Math.max(n, 1), 20) };
	} catch {
		return { low: false, required: REQUIRED_READS };
	}
}

/** Absolute, forward-slashed, without `.` / `..` segments; a relative path is taken from `cwd`. */
export function absolute(path: string, cwd: string): string {
	const slashed = path.replace(/\\/g, "/");
	const full = /^([A-Za-z]:)?\//.test(slashed) ? slashed : `${cwd.replace(/\\/g, "/").replace(/\/$/, "")}/${slashed}`;
	const head = /^[A-Za-z]:/.exec(full)?.[0] ?? "";
	const parts: string[] = [];
	for (const part of full.slice(head.length).split("/")) {
		if (part === "" || part === ".") continue;
		if (part === "..") parts.pop();
		else parts.push(part);
	}
	return `${head}/${parts.join("/")}`;
}

/** The directory a file lives in (pi flagged the directory of each file the check named). */
export function dirOf(path: string, cwd: string): string {
	const full = absolute(path, cwd);
	const cut = full.lastIndexOf("/");
	return cut <= 0 ? "/" : full.slice(0, cut);
}

/** Flags the directories of `files` (reads start at zero); no files, nothing to flag — as in pi. */
export function flagsOf(files: string[], cwd: string, required: number): Flag[] {
	const dirs = [...new Set(files.map((f) => dirOf(f, cwd)))];
	return dirs.map((dir) => ({ dir, required, reads: [], confirmed: false }));
}

const under = (path: string, dir: string): boolean => dir === "/" || path === dir || path.startsWith(`${dir}/`);

/** The flag governing an absolute path: the longest matching directory. */
export function flagForPath(flags: Flag[], path: string): Flag | undefined {
	let best: Flag | undefined;
	for (const flag of flags) if (under(path, flag.dir) && (!best || flag.dir.length > best.dir.length)) best = flag;
	return best;
}

/** The read of an absolute path counted against its flag; the same file counts once. */
export function withRead(flags: Flag[], path: string): Flag[] {
	const target = flagForPath(flags, path);
	if (!target || target.reads.includes(path)) return flags;
	return flags.map((f) => (f === target ? { ...f, reads: [...f.reads, path] } : f));
}

export const explored = (flag: Flag): boolean => flag.reads.length >= flag.required;

/** A reply line `Hypothesis: …` / `Hypotéza: …` (bold or quoted is fine) with at least ten characters of substance. */
const HYPOTHESIS = /^[\s>*_-]*(?:Hypothesis|Hypot[eé]za)[\s*_]*:[\s*_]*\S[^\n]{8,}/im;
export const statesHypothesis = (text: string): boolean => HYPOTHESIS.test(text);

export type Decision = { kind: "allow"; confirm?: Flag } | { kind: "deny"; reason: string };

/** The reason shown to the model (English, as pi's: the model reads it). */
export function denyReason(flag: Flag): string {
	const left = Math.max(flag.required - flag.reads.length, 0);
	const say = `state your hypothesis about the subsystem (a falsifiable understanding of how it works) in your reply as one line starting "Hypothesis:"`;
	if (left === 0) return `[UMA Humility] ${flag.dir} is low-familiarity: ${flag.reads.length} related file(s) read, but no hypothesis stated. Read-Only Explorative Mode: ${say}, then retry the edit.`;
	return `[UMA Humility] No memory covers ${flag.dir} and you have read ${flag.reads.length}/${flag.required} related files. Read-Only Explorative Mode: read ${left} more related file(s) with Read, ${say}, then retry the edit.`;
}

/**
 * The gate for a mutation of `path`. No flag or already confirmed → allow; too few reads → deny;
 * enough reads → the hypothesis decides (`stated` reads the transcript, asked only then).
 */
export async function decide(flags: Flag[], path: string, stated: () => Promise<boolean>): Promise<Decision> {
	const flag = flagForPath(flags, path);
	if (!flag || flag.confirmed) return { kind: "allow" };
	if (!explored(flag)) return { kind: "deny", reason: denyReason(flag) };
	return (await stated()) ? { kind: "allow", confirm: flag } : { kind: "deny", reason: denyReason(flag) };
}
