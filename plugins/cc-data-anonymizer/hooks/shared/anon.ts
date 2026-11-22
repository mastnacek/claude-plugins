// anon.ts — deep module: the only place that runs the `anon` CLI.
// Callers get mask / unmask / scan and one error type; where the binary lives,
// how stdin and JSON are handled and what "failed" means stay in here.
// Every failure throws AnonError: callers fail closed (deny / drop), never pass
// the original through.

import type { EngineInterface, Register } from "claude-code";
import type { MaskNote } from "../../types";
import type { Finding } from "./findings";
import { type Reveal, shown } from "./reveal";
import { rememberTags } from "./tags";

type $ = EngineInterface;

export class AnonError extends Error {}

/** `anon unmask --strict` found tags anon does not know (forgotten, foreign, mangled, escaped). */
export class UnknownTagsError extends AnonError {
	constructor(readonly tags: string[]) {
		super(`anon found tags it cannot restore: ${tags.join(" ")}`);
	}
}

/** Shown once per session as a toast and under every row masked while anon is locked. */
export const LOCKED_NOTE =
	"anon je zamčený: maskuje se jen podle pravidel (trezor a mapa nejsou k dispozici). Spusť anon unlock.";

/** `anon unmask` while locked met a tag only the main map knows (anon's own wording). */
export const LOCKED_TAG = "anon je zamčený: tuto značku vrátí až anon unlock. Spusť anon unlock ve vlastním terminálu.";

export class LockedTagError extends AnonError {
	constructor() {
		super(LOCKED_TAG);
	}
}

let isToasted = false;

/** The toast of the locked state, once per session (a reload starts over). */
function toastLocked($: $): void {
	if (isToasted) return;
	isToasted = true;
	$.ui.toast(LOCKED_NOTE);
}

export type Style = "fake" | "redact" | "tag";

/** The `style` option as an `anon mask --style` value; unset or "default" leaves it to anon (its rules.toml). */
export function styleOf(options: Parameters<Register>[1]): Style | undefined {
	const value = options.style;
	return value === "fake" || value === "redact" || value === "tag" ? value : undefined;
}

type ScanFinding = {
	kind: string;
	rule: string;
	chars: number;
	value?: string;
	places: { path: string; line: number; column: number }[];
};

/** Collects the outcome of mask calls for the screen; `reveal` says how much of a value it may keep. */
export type NoteSink = { reveal: Reveal; note: MaskNote | undefined };

export function noteSink(reveal: Reveal): NoteSink {
	return { reveal, note: undefined };
}

/** Adds `b` to `a` (counts add, values join without repeats). */
export function mergeNotes(a: MaskNote | undefined, b: MaskNote): MaskNote {
	if (a === undefined) return b;
	const kinds = { ...a.kinds };
	for (const [kind, n] of Object.entries(b.kinds)) kinds[kind] = (kinds[kind] ?? 0) + n;
	const seen = new Set(a.values.map((v) => `${v.kind}\0${v.text}`));
	const values = [...a.values, ...b.values.filter((v) => !seen.has(`${v.kind}\0${v.text}`))];
	const isLocked = a.isLocked === true || b.isLocked === true;
	return { count: a.count + b.count, kinds, style: b.style || a.style, values, ...(isLocked ? { isLocked } : {}) };
}
export type ScanResult = { isFound: boolean; findings: Finding[] };

const FALLBACK = "D:/01_programovani/_tools/anon.exe";
const SEPARATOR = "\n\x1e<anon-separator>\x1e\n";

let resolved: string | undefined;

/** ANON_BIN, then `anon` on PATH, then the tools folder; the first that answers `help`. */
async function binary($: $): Promise<string> {
	if (resolved) return resolved;
	const fromEnv = (await $.env.get("ANON_BIN"))?.trim();
	const candidates = [...(fromEnv ? [fromEnv] : []), "anon", FALLBACK];
	for (const candidate of candidates) {
		try {
			const probe = await $.process.run([candidate, "help"]);
			if (probe.exitCode === 0) return (resolved = candidate);
		} catch {
			// not runnable here, try the next one
		}
	}
	throw new AnonError(
		"anon was not found (tried ANON_BIN, PATH and " + FALLBACK + "); nothing is read until it works.",
	);
}

async function exec($: $, args: string[], stdin?: string) {
	const bin = await binary($);
	try {
		return await $.process.run([bin, ...args], stdin === undefined ? {} : { stdin });
	} catch (error) {
		throw new AnonError(`anon could not run: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function firstLine(text: string): string {
	return text.trim().split("\n")[0] ?? "";
}

type Replacement = { kind?: unknown; count?: unknown };

/** What the screen may learn from one `anon mask --json`: counts per kind and the style, never a value. */
function noteOf(parsed: { style?: unknown; replacements?: unknown; locked?: unknown }): MaskNote {
	const kinds: Record<string, number> = {};
	const list = Array.isArray(parsed.replacements) ? (parsed.replacements as Replacement[]) : [];
	for (const r of list) {
		if (typeof r.kind === "string" && typeof r.count === "number") kinds[r.kind] = (kinds[r.kind] ?? 0) + r.count;
	}
	const count = Object.values(kinds).reduce((sum, n) => sum + n, 0);
	return {
		count,
		kinds,
		style: typeof parsed.style === "string" ? parsed.style : "",
		values: [],
		...(parsed.locked === true ? { isLocked: true } : {}),
	};
}

/**
 * The values anon finds in `text` (`anon scan - --json --with-values`), formatted for the screen at once.
 * Display only: a failure here shows nothing, it never blocks the masking.
 */
async function detected($: $, text: string, reveal: Reveal): Promise<MaskNote["values"]> {
	if (reveal === "none") return [];
	try {
		const run = await exec($, ["scan", "-", "--json", "--with-values"], text);
		if (run.exitCode !== 3) return [];
		const parsed = JSON.parse(run.stdout) as { findings?: ScanFinding[] };
		return (parsed.findings ?? []).flatMap((f) => {
			const text = f.value === undefined ? undefined : shown(f.kind, f.value, reveal);
			return text === undefined ? [] : [{ kind: f.kind, text }];
		});
	} catch {
		return [];
	}
}

async function transform(
	$: $,
	command: "mask" | "unmask",
	text: string,
	style?: Style,
	sink?: NoteSink,
	strict = true,
): Promise<string> {
	if (text === "") return text;
	const flags = command === "mask" ? (style ? ["--style", style] : []) : strict ? ["--strict"] : [];
	const run = await exec($, [command, "-", ...flags, "--json"], text);
	// Exit 3 with --strict: the text still holds tags anon did not issue (listed in unknown_tags).
	if (run.exitCode === 3 && command === "unmask" && strict) {
		try {
			const unknown = (JSON.parse(run.stdout) as { unknown_tags?: unknown }).unknown_tags;
			if (Array.isArray(unknown) && unknown.length > 0) throw new UnknownTagsError(unknown.map(String));
		} catch (error) {
			if (error instanceof UnknownTagsError) throw error;
		}
	}
	if (run.exitCode !== 0) {
		if (command === "unmask" && /tuto značku vrátí až anon unlock/.test(run.stderr + run.stdout)) throw new LockedTagError();
		throw new AnonError(`anon ${command} failed (exit ${run.exitCode}): ${firstLine(run.stderr || run.stdout)}`);
	}
	let parsed: { ok?: boolean; text?: unknown; style?: unknown; replacements?: unknown; locked?: unknown };
	try {
		parsed = JSON.parse(run.stdout);
	} catch {
		throw new AnonError(`anon ${command} returned unreadable output`);
	}
	if (parsed.ok !== true || typeof parsed.text !== "string") {
		throw new AnonError(`anon ${command} reported an error`);
	}
	// Every tag the model gets to see is one this session was issued; unmask accepts no other.
	if (command === "mask") await rememberTags($, parsed.text);
	// A locked anon still masks by its rules: the session goes on, the screen says what is missing.
	if (parsed.locked === true) toastLocked($);
	if (command === "mask" && sink !== undefined) {
		const note = noteOf(parsed);
		if (note.count > 0 || note.isLocked) {
			note.values = await detected($, text, sink.reveal);
			sink.note = mergeNotes(sink.note, note);
		}
	}
	return parsed.text;
}

export function mask($: $, text: string, style?: Style, sink?: NoteSink): Promise<string> {
	return transform($, "mask", text, style, sink);
}

export function unmask($: $, text: string, strict = true): Promise<string> {
	return transform($, "unmask", text, undefined, undefined, strict);
}

/**
 * `anon scan <path> --json` (`--with-values` unless reveal is none): exit 0 nothing found, 3 found.
 * A finding carries the value only as `shown`, already cut to what the person may see.
 */
export async function scan($: $, path: string, reveal: Reveal = "none"): Promise<ScanResult> {
	const run = await exec($, ["scan", path, "--json", ...(reveal === "none" ? [] : ["--with-values"])]);
	if (run.exitCode === 0) return { isFound: false, findings: [] };
	if (run.exitCode !== 3) {
		throw new AnonError(`anon scan failed (exit ${run.exitCode}): ${firstLine(run.stderr || run.stdout)}`);
	}
	let parsed: { findings?: ScanFinding[] };
	try {
		parsed = JSON.parse(run.stdout);
	} catch {
		throw new AnonError("anon scan returned unreadable output");
	}
	const findings = (parsed.findings ?? []).flatMap((f) => {
		const text = f.value === undefined ? undefined : shown(f.kind, f.value, reveal);
		return f.places.map((p) => ({
			path: p.path,
			line: p.line,
			column: p.column,
			kind: f.kind,
			rule: f.rule,
			chars: f.chars,
			...(text === undefined ? {} : { shown: text }),
		}));
	});
	return { isFound: true, findings };
}

/**
 * Masks (or unmasks) every string inside `value` with one anon call; the shape is kept.
 * Unmask is strict unless told otherwise: tags anon cannot restore throw `UnknownTagsError`.
 */
export async function convert<T>(
	$: $,
	command: "mask" | "unmask",
	value: T,
	style?: Style,
	sink?: NoteSink,
	strict = true,
): Promise<T> {
	const strings: string[] = [];
	const collect = (node: unknown): void => {
		if (typeof node === "string") strings.push(node);
		else if (Array.isArray(node)) node.forEach(collect);
		else if (node !== null && typeof node === "object") Object.values(node).forEach(collect);
	};
	collect(value);
	if (strings.length === 0) return value;

	const joined = await transform($, command, strings.join(SEPARATOR), style, sink, strict);
	const parts = joined.split(SEPARATOR);
	if (parts.length !== strings.length) throw new AnonError(`anon ${command} changed the structure of the text`);

	let next = 0;
	const rebuild = (node: unknown): unknown => {
		if (typeof node === "string") return parts[next++];
		if (Array.isArray(node)) return node.map(rebuild);
		if (node !== null && typeof node === "object") {
			return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, rebuild(item)]));
		}
		return node;
	};
	return rebuild(value) as T;
}
