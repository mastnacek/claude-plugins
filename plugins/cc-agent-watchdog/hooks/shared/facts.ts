// facts.ts — what a Bash command or a file tool does, read from the ledger event:
// which paths it writes or deletes, whether it is a gate run, whether it is masked by a pipe.

import { baseName, matchesAny, resolvePath, under } from "./paths";
import { runsInterpreter, scriptWrites } from "./script";
import { nameOf, parseCommand, positionals } from "./shell";
import type { Cmd } from "./shell";
import type { Config, Ev, ToolEv } from "./types";

export const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export const isTool = (ev: Ev): ev is ToolEv => ev.kind === "tool";

export type Facts = {
	cmds: Cmd[];
	/** Absolute paths the command writes (redirects, tee, cp/mv target, sed -i, touch, mkdir, dd of=). */
	writes: string[];
	/** Of those, the ones that make a file new (not `sed -i`). */
	creates: string[];
	/** Absolute paths `rm` / `rmdir` / `find -delete` go for (globs kept as written). */
	deletes: string[];
};

const cache = new WeakMap<ToolEv, Facts>();

const SED_INPLACE = /^-[nEsrz]*i.*$|^--in-place/;

function targetsOf(cmd: Cmd): { writes: string[]; creates: string[] } {
	const writes: string[] = [];
	const creates: string[] = [];
	for (const r of cmd.redirects) {
		if ((r.op === ">" || r.op === ">>") && !r.target.startsWith("/dev/")) {
			writes.push(r.target);
			creates.push(r.target);
		}
	}
	const name = nameOf(cmd);
	const args = cmd.words.slice(1);
	if (name === "tee") {
		const files = positionals(cmd.words);
		writes.push(...files);
		creates.push(...files);
	} else if (name === "cp" || name === "mv" || name === "install" || name === "ln") {
		const t = args.findIndex((a) => a === "-t" || a === "--target-directory");
		const pos = positionals(cmd.words, new Set(["-t", "--target-directory", "-S", "--suffix"]));
		const dest = t >= 0 ? args[t + 1] : pos.length >= 2 ? pos[pos.length - 1] : undefined;
		if (dest) {
			writes.push(dest);
			creates.push(dest);
		}
	} else if (name === "sed" && args.some((a) => SED_INPLACE.test(a))) {
		const hasScript = args.some((a) => a === "-e" || a === "-f" || a === "--expression" || a === "--file");
		const pos = positionals(cmd.words, new Set(["-e", "-f", "--expression", "--file"]));
		writes.push(...(hasScript ? pos : pos.slice(1)));
	} else if (name === "perl" && args.some((a) => /^-[a-z]*i/.test(a))) {
		const hasScript = args.includes("-e");
		const pos = positionals(cmd.words, new Set(["-e", "-I"]));
		writes.push(...(hasScript ? pos : pos.slice(1)));
	} else if (name === "touch" || name === "mkdir" || name === "truncate") {
		const files = positionals(cmd.words, new Set(["-s", "--size", "-d", "-t", "-r", "-m"]));
		writes.push(...files);
		creates.push(...files);
	} else if (name === "dd") {
		for (const a of args) if (a.startsWith("of=")) {
			writes.push(a.slice(3));
			creates.push(a.slice(3));
		}
	}
	return { writes, creates };
}

function deletesOf(cmd: Cmd): string[] {
	const name = nameOf(cmd);
	if (name === "rm" || name === "rmdir" || name === "shred" || name === "unlink") return positionals(cmd.words);
	if (name === "find" && cmd.words.includes("-delete")) {
		const roots: string[] = [];
		for (const w of cmd.words.slice(1)) {
			if (w.startsWith("-") || w === "(" || w === "!") break;
			roots.push(w);
		}
		return roots;
	}
	return [];
}

/** Facts of a Bash event (cached); empty for other tools. */
export function factsOf(ev: ToolEv, cfg: Config): Facts {
	const known = cache.get(ev);
	if (known) return known;
	const abs = (p: string) => resolvePath(p, ev.cwd, cfg.home);
	const cmds = ev.tool === "Bash" && ev.command ? parseCommand(ev.command) : [];
	const writes: string[] = [];
	const creates: string[] = [];
	const deletes: string[] = [];
	// A script in an interpreter (heredoc or -c) writes files the tokenizer cannot see.
	if (ev.command && runsInterpreter(cmds)) writes.push(...scriptWrites(ev.command).map(abs));
	for (const c of cmds) {
		const t = targetsOf(c);
		writes.push(...t.writes.map(abs));
		creates.push(...t.creates.map(abs));
		deletes.push(...deletesOf(c).map(abs));
	}
	const facts = { cmds, writes, creates, deletes };
	cache.set(ev, facts);
	return facts;
}

/** Paths a tool call changes: a file tool's path, or what the shell line writes. */
export function writtenPaths(ev: ToolEv, cfg: Config): string[] {
	if (FILE_TOOLS.has(ev.tool)) return ev.path ? [resolvePath(ev.path, ev.cwd, cfg.home)] : [];
	return factsOf(ev, cfg).writes;
}

/** Scratch space for probes. The work tree itself never is: a project that lives under /tmp/claude-* is still the project. */
export const isScratch = (path: string, cfg: Config): boolean => !under(path, cfg.workdir) && matchesAny(path, cfg.scratch, cfg.workdir, cfg.home);

export const isAllowed = (path: string, cfg: Config): boolean => under(path, cfg.workdir) || isScratch(path, cfg) || matchesAny(path, cfg.allowed, cfg.workdir, cfg.home);

/** Protected, unless the assignment lists it among the allowed paths. */
export const isProtected = (path: string, cfg: Config): boolean => matchesAny(path, cfg.protected, cfg.workdir, cfg.home) && !matchesAny(path, cfg.allowed, cfg.workdir, cfg.home);

/** A real change of the work: a successful write that is not a probe in scratch or /dev. */
export function isMutation(ev: ToolEv, cfg: Config): boolean {
	if (ev.denied || ev.isError) return false;
	return writtenPaths(ev, cfg).some((p) => !p.startsWith("/dev/") && !isScratch(p, cfg));
}

// --- the gate -------------------------------------------------------------

const MASKERS = new Set(["tail", "head", "grep", "egrep", "tee", "sed", "awk", "cat", "wc", "cut", "sort", "less", "more"]);

export const gateWords = (item: string): string[] => item.trim().split(/\s+/).filter(Boolean);

function matchesGate(cmd: Cmd, words: string[]): boolean {
	if (words.length === 0 || cmd.words.length < words.length) return false;
	return words.every((w, i) => (i === 0 ? baseName(cmd.words[0] as string) === baseName(w) : cmd.words[i] === w));
}

/** Does this call run gate item `item`; is its exit code hidden behind a pipe without pipefail. */
export function gateRun(ev: ToolEv, item: string, cfg: Config): Run {
	const words = gateWords(item);
	return runOf(ev, cfg, (c) => matchesGate(c, words));
}

/** Whether a call runs a command; whether its exit code is hidden, and how (`how`, Czech, for the report). */
export type Run = { runs: boolean; masked: boolean; how?: string };

/** Does this call run a command `isIt` accepts; is its exit code hidden (pipe without pipefail, `||`, `;`). */
export function runOf(ev: ToolEv, cfg: Config, isIt: (cmd: Cmd) => boolean): Run {
	if (ev.tool !== "Bash" || ev.denied) return { runs: false, masked: false };
	const { cmds } = factsOf(ev, cfg);
	const at = cmds.findIndex(isIt);
	if (at < 0) return { runs: false, masked: false };
	const cmd = cmds[at] as Cmd;
	const next = cmds[at + 1];
	const piped = cmd.pipeOut && next !== undefined && MASKERS.has(nameOf(next)) && !/pipefail|PIPESTATUS/.test(ev.command ?? "");
	// `make test || true`, `make test; true`, `npm test; git diff`: the line's exit code is not the command's.
	const swallowed = next !== undefined && (cmd.after === "||" || cmd.after === ";");
	if (piped) return { runs: true, masked: true, how: `v rouře do ${nameOf(next as Cmd)} bez pipefail` };
	if (swallowed) return { runs: true, masked: true, how: `za ním „${cmd.after}“, exit kód se ztratí` };
	return { runs: true, masked: false };
}

export const failed = (ev: ToolEv): boolean => ev.isError || (ev.exitCode !== undefined && ev.exitCode !== 0);

/** Short text of what a call did, for evidence. */
export function describe(ev: ToolEv, max = 100): string {
	const what = ev.command ?? ev.path ?? ev.url ?? "";
	const one = what.replace(/\s+/g, " ").trim();
	return `${ev.tool}${one ? ` ${one.length > max ? `${one.slice(0, max - 1)}…` : one}` : ""}`;
}
