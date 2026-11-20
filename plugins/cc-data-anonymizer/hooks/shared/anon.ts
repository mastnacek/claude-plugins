// anon.ts — deep module: the only place that runs the `anon` CLI.
// Callers get mask / unmask / scan and one error type; where the binary lives,
// how stdin and JSON are handled and what "failed" means stay in here.
// Every failure throws AnonError: callers fail closed (deny / drop), never pass
// the original through.

import type { EngineInterface } from "claude-code";

type $ = EngineInterface;

export class AnonError extends Error {}

export type ScanResult = { isFound: boolean; summary: string };

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

async function transform($: $, command: "mask" | "unmask", text: string): Promise<string> {
	if (text === "") return text;
	const run = await exec($, [command, "-", "--json"], text);
	if (run.exitCode !== 0) {
		throw new AnonError(`anon ${command} failed (exit ${run.exitCode}): ${firstLine(run.stderr || run.stdout)}`);
	}
	let parsed: { ok?: boolean; text?: unknown };
	try {
		parsed = JSON.parse(run.stdout);
	} catch {
		throw new AnonError(`anon ${command} returned unreadable output`);
	}
	if (parsed.ok !== true || typeof parsed.text !== "string") {
		throw new AnonError(`anon ${command} reported an error`);
	}
	return parsed.text;
}

export function mask($: $, text: string): Promise<string> {
	return transform($, "mask", text);
}

export function unmask($: $, text: string): Promise<string> {
	return transform($, "unmask", text);
}

/** `anon scan <path>`: exit 0 nothing found, 3 found; the summary lines hold no values. */
export async function scan($: $, path: string): Promise<ScanResult> {
	const run = await exec($, ["scan", path]);
	if (run.exitCode === 0) return { isFound: false, summary: "" };
	if (run.exitCode === 3) return { isFound: true, summary: run.stdout.trim() };
	throw new AnonError(`anon scan failed (exit ${run.exitCode}): ${firstLine(run.stderr || run.stdout)}`);
}

/** Masks (or unmasks) every string inside `value` with one anon call; the shape is kept. */
export async function convert<T>($: $, command: "mask" | "unmask", value: T): Promise<T> {
	const strings: string[] = [];
	const collect = (node: unknown): void => {
		if (typeof node === "string") strings.push(node);
		else if (Array.isArray(node)) node.forEach(collect);
		else if (node !== null && typeof node === "object") Object.values(node).forEach(collect);
	};
	collect(value);
	if (strings.length === 0) return value;

	const joined = await transform($, command, strings.join(SEPARATOR));
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
