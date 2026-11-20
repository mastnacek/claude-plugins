// bypass.ts — pure logic of write-gate, a port of pi-uma's approval_gate: does a
// path or a shell command change the UMA memory store behind the approved
// tools' back? Crude on purpose (a tokenizer, not a shell), fail-closed in the
// spellings seen in live bypasses. Symlinks are the caller's: a path is judged
// by its spelling here.

/** UMA executables that can persist memory (bare name, with or without path). */
const UMA_BINARY_NAMES = new Set(["uma", "uma.exe", "uma-cli", "uma-cli.exe"]);

/** Subcommands whose execution persists to the memory store. */
function subcommandMutatesMemory(tokens: string[]): boolean {
	const sub = tokens[0]?.toLowerCase();
	const second = tokens[1]?.toLowerCase();
	if (sub === "write" || sub === "supersede") return true;
	if (sub === "staging" && (second === "approve" || second === "discard")) return true;
	if (sub === "skill" && second === "new") return true;
	if (sub === "muscle" && second === "new") return true;
	// plasticity writes fitness telemetry — a model must not inflate a rule's weight via bash.
	if (sub === "plasticity" && (second === "reinforce" || second === "frustrate")) return true;
	if (sub === "mcp" && second === "serve" && tokens.some((t) => t === "--allow-writes")) return true;
	// `domains set` rewrites fact frontmatter; `migrate` rewrites every fact file;
	// `sync push|pull` publishes or merges the whole global store; `muscle run
	// --confirm` runs a routine without its consent dialog.
	// `debt clear` wipes the whole ledger: a human action (/uma debt clear). add/settle/list/check stay free.
	if (sub === "debt" && second === "clear") return true;
	if (sub === "domains" && second === "set") return true;
	if (sub === "migrate" && !tokens.some((t) => t.toLowerCase() === "--dry-run")) return true;
	if (sub === "sync" && (second === "push" || second === "pull")) return true;
	if (sub === "muscle" && second === "run" && tokens.some((t) => t.toLowerCase() === "--confirm")) return true;
	return false;
}

/**
 * True when the path targets a UMA memory store (project `.uma/` or the global
 * store on any platform). Separators and case are normalized; the global
 * layouts are known:
 *   Windows: %APPDATA%\uma\global                      (legacy: %APPDATA%\uma\uma\data\global)
 *   macOS:   ~/Library/Application Support/uma/global  (legacy: …/com.uma.uma/global)
 *   Linux:   ~/.local/share/uma/global
 * Legacy shapes stay guarded until the data is moved. Siblings of `global/`
 * (e.g. `uma/agent-watchdog/`) are not the store.
 */
export function isUmaMemoryFilePath(targetPath: string): boolean {
	const norm = targetPath.replace(/\\/g, "/").toLowerCase();
	if (norm.includes("/.uma/") || norm.startsWith(".uma/") || norm.endsWith("/.uma") || norm === ".uma") return true;
	const globalMarkers = [
		"/uma/uma/data/global/",
		"/uma/data/global/",
		"/com.uma.uma/global/",
		"/.local/share/uma/global/",
		"/appdata/roaming/uma/global/",
		"/application support/uma/global/",
	];
	return globalMarkers.some((m) => norm.includes(m) || norm.endsWith(m.slice(0, -1)));
}

/** Heredoc operator: `<<EOF`, `<<-EOF`, `<<'EOF'`, `<<"EOF"`, `<< EOF`; never the here-string `<<<`. */
const HEREDOC_RE = /(?<!<)<<(?!<)(-?)\s*(?:'([^']*)'|"([^"]*)"|\\?([A-Za-z0-9_]+))/g;

/** Commands that run what they read: a heredoc body given to them is code, not text. */
const SCRIPT_READERS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish", "python", "python3", "node", "perl", "ruby", "php", "deno", "bun", "cmd", "powershell", "pwsh", "eval", "xargs", "source", "."]);
const SCRIPT_READER_VERSIONED_RE = /^(python|node|perl|ruby|php)[\d.]*$/;

/** True when any token of the line names a shell/interpreter (also after a wrapper, a path or a pipe:
 *  `cat <<EOF | sh` feeds the body to sh). Conservative: a mere mention counts. */
function lineRunsScripts(line: string): boolean {
	return line
		.split(/[|;&\s]+/)
		.map((t) => executableName(t.replace(/^["'`]+|["'`]+$/g, "")))
		.some((name) => SCRIPT_READERS.has(name) || SCRIPT_READER_VERSIONED_RE.test(name));
}

/**
 * Drops the bodies (and terminators) of heredocs whose reader is not a shell or
 * interpreter, so text written into a file (`cat > README.md <<'EOF'`) is not judged
 * as commands. The operator line stays: its redirect target is still checked. A body
 * given to a shell/interpreter stays (it runs); an unterminated heredoc stays whole.
 */
function withoutHeredocBodies(command: string): string {
	const lines = command.split("\n");
	const out: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		out.push(line);
		const docs = [...line.matchAll(HEREDOC_RE)].map((m) => ({ dash: m[1] === "-", delim: m[2] ?? m[3] ?? m[4] ?? "" }));
		if (docs.length === 0) continue;
		const runs = lineRunsScripts(line);
		for (const doc of docs) {
			let end = -1;
			for (let j = i + 1; j < lines.length; j++) {
				const candidate = doc.dash ? (lines[j] ?? "").replace(/^\t+/, "") : (lines[j] ?? "");
				if (candidate === doc.delim) {
					end = j;
					break;
				}
			}
			if (runs || end < 0) continue; // runs: judged as today; unterminated: judge the whole rest
			i = end; // skip body and terminator
		}
	}
	return out.join("\n");
}

/** Old, quote-blind split: operators and whitespace anywhere. Kept as the fail-closed fallback
 *  when a quote is never closed (a stray apostrophe must not hide a command behind it). */
function naiveSegments(text: string): string[][] {
	return text
		.split(/[|;&\n]+/)
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => s.split(/\s+/).map((t) => t.replace(/^["'`]+|["'`]+$/g, "")));
}

/** Quote-aware split into segments of tokens: `| ; & \n` and whitespace end a segment/token only
 *  outside quotes; the quote characters are dropped, so `".uma/a b.md"` is ONE token and
 *  `'s|x|y|'` never splits. `\"` inside double quotes is a literal quote. Null on an unclosed quote. */
function scanSegments(text: string): string[][] | null {
	const segs: string[][] = [];
	let toks: string[] = [];
	let cur = "";
	let has = false;
	let quote = "";
	const endToken = () => {
		if (has || cur) toks.push(cur.replace(/^`+|`+$/g, ""));
		cur = "";
		has = false;
	};
	const endSegment = () => {
		endToken();
		if (toks.length > 0) segs.push(toks);
		toks = [];
	};
	for (let i = 0; i < text.length; i++) {
		const c = text[i] ?? "";
		if (quote) {
			if (c === quote) quote = "";
			else if (quote === '"' && c === "\\" && text[i + 1] === '"') {
				cur += '"';
				i++;
			} else cur += c;
			continue;
		}
		if (c === "'" || c === '"') {
			quote = c;
			has = true;
		} else if (c === "\n" || c === "|" || c === ";" || c === "&") endSegment();
		else if (/\s/.test(c)) endToken();
		else cur += c;
	}
	if (quote) return null;
	endSegment();
	return segs;
}

function scanOrNaive(text: string): string[][] {
	return scanSegments(text) ?? naiveSegments(text);
}

/** A shell wrapper (`sudo bash -c "a; b"`) is replaced by the segments of its body, recursively. */
function expandWrapper(tokens: string[], depth: number): string[][] {
	const rest = tokens.slice(commandIndexAfter(tokens, true));
	const body = unwrapShell(rest);
	if (body === undefined || body.length === 0 || depth >= 8) return [tokens];
	return scanOrNaive(body.join(" ")).flatMap((t) => expandWrapper(t, depth + 1));
}

/** Splits a shell line into command segments (crude, but quote-aware), wrapper bodies inlined. */
function segments(command: string): string[][] {
	return scanOrNaive(withoutHeredocBodies(command)).flatMap((t) => expandWrapper(t, 0));
}

/** True when a token names a UMA executable (quotes/path already stripped). */
function isUmaExecutable(token: string): boolean {
	const base = token.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
	return UMA_BINARY_NAMES.has(base);
}

/** True when a token names or embeds a UMA memory store path. Substring
 *  semantics: an argv token may be a bare path (`.uma/x.md`), an absolute
 *  store path, or embedded code (`open('.uma/x','w')`). */
function tokenTouchesStore(token: string): boolean {
	const norm = token.replace(/\\/g, "/").toLowerCase();
	if (norm === ".uma" || /(^|[^a-z0-9_.])\.uma\//.test(norm)) return true;
	return norm.includes("uma/uma/data/global") || norm.includes("uma/data/global") || norm.includes("com.uma.uma/global") || norm.includes(".local/share/uma/global") || /appdata%?\/(roaming\/)?uma\/global/.test(norm) || norm.includes("application support/uma/global");
}

/** Separate-form output redirections: ">", ">>", "2>", "2>>", "&>", "&>>". */
const REDIRECT_OP_RE = /^&?\d*>>?$/;
/** Attached form — operator and target share one token: "2>/dev/null", ">>out". */
const ATTACHED_REDIRECT_RE = /^&?\d*(>>|>)(\S+)$/;

/** True when an output redirection in the segment lands in a store path.
 *  Input redirection (`< file`) is a read; `/dev/null` and temp targets stay allowed. */
function redirectWritesStore(tokens: string[]): boolean {
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i] ?? "";
		if (REDIRECT_OP_RE.test(token)) {
			const target = tokens[i + 1];
			if (target && tokenTouchesStore(target)) return true;
			continue;
		}
		const attached = ATTACHED_REDIRECT_RE.exec(token);
		if (attached && tokenTouchesStore(attached[2] ?? "")) return true;
	}
	return false;
}

/** Utilities whose execution can mutate any file they name. Windows and
 *  PowerShell spellings are listed too: wrapper bodies (`cmd /c`,
 *  `powershell -Command`) are scanned, so `copy nul .uma\x.md` and
 *  `Set-Content .uma/x.md` count like `cp` and `tee`. */
const MUTATING_UTILS = new Set([
	"tee", "cp", "mv", "rm", "del", "sed", "truncate", "dd",
	"install", "rsync", "ln", "touch", "chmod", "chown", "chgrp", "python", "python3", "perl", "node",
	// cmd.exe builtins
	"copy", "move", "ren", "rename", "erase", "rd", "rmdir", "xcopy", "robocopy",
	// PowerShell cmdlets (and their common aliases)
	"set-content", "add-content", "out-file", "copy-item", "move-item", "remove-item",
	"new-item", "clear-content", "rename-item", "sc", "ac", "cpi", "mi", "ri", "ni",
]);

/** Shells whose `-c` (or `/c`, `-Command`) body is itself a command line: a
 *  memory write hidden in it is judged like a bare one. */
const SH_WRAPPERS = new Set(["bash", "sh", "zsh", "dash", "ksh", "fish"]);
const CMD_WRAPPERS = new Set(["cmd"]);
const PS_WRAPPERS = new Set(["powershell", "pwsh"]);

/** Lower-case basename without a trailing `.exe`: `C:/Git/bin/bash.exe` → `bash`. */
function executableName(token: string): string {
	const base = token.replace(/\\/g, "/").split("/").pop()?.toLowerCase() ?? "";
	return base.endsWith(".exe") ? base.slice(0, -4) : base;
}

/**
 * Strips one shell-wrapper prefix: `bash -lc`, `cmd /c`, `powershell -Command`
 * (any flag order; the body starts after the command flag). Returns the body
 * tokens, or undefined when the segment is not a wrapper invocation. Quotes
 * were already stripped per token by segments(), so the body is inline.
 */
function unwrapShell(tokens: string[]): string[] | undefined {
	const name = executableName(tokens[0] ?? "");
	let isBody: (flag: string) => boolean;
	if (SH_WRAPPERS.has(name)) isBody = (f) => /^-[a-z]*c[a-z]*$/i.test(f);
	else if (CMD_WRAPPERS.has(name)) isBody = (f) => /^\/[ck]$/i.test(f);
	else if (PS_WRAPPERS.has(name)) isBody = (f) => /^-c(o(m(m(a(n(d)?)?)?)?)?)?$/i.test(f);
	else return undefined;
	for (let i = 1; i < tokens.length; i++) {
		const token = tokens[i] ?? "";
		if (isBody(token)) return tokens.slice(i + 1);
		if (!token.startsWith("-") && !token.startsWith("/")) break; // positional: a script file, not a body
	}
	return undefined;
}

/** Wrappers that do not change what the effective command touches. */
const TRANSPARENT_WRAPPERS = new Set(["sudo", "env", "command", "nohup", "time", "nice", "xargs"]);

/** Index of the first token that is not a wrapper (env assignments optionally ignored). */
function commandIndexAfter(tokens: string[], skipEnv: boolean): number {
	let i = 0;
	while (i < tokens.length && (TRANSPARENT_WRAPPERS.has(tokens[i] ?? "") || (skipEnv && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i] ?? "")))) i++;
	return i;
}

/** The effective command line after env assignments, transparent wrappers and
 *  any chain of shell wrappers (`sudo bash -c "cmd /c …"`). */
function unwrapAll(tokens: string[]): string[] {
	let rest = tokens.slice(commandIndexAfter(tokens, true));
	for (let guard = 0; guard < 8; guard++) {
		const body = unwrapShell(rest);
		if (body === undefined) break;
		rest = body.slice(commandIndexAfter(body, true));
	}
	return rest;
}

interface ParsedArgs {
	opts: { name: string; value?: string }[];
	operands: string[];
}

/** Options split from operands. `short` lists letters taking a value (`-t DIR`, `-tDIR`), `long` the
 *  `--name VALUE` options (`--name=VALUE` is always one token), `stop` letters whose rest is an
 *  attached suffix (`sed -i.bak`). `--` ends options; a lone `-` is an operand. */
function parseArgs(args: string[], short: string, long: string[], stop = ""): ParsedArgs {
	const opts: ParsedArgs["opts"] = [];
	const operands: string[] = [];
	let onlyOperands = false;
	for (let i = 0; i < args.length; i++) {
		const token = args[i] ?? "";
		if (onlyOperands || token === "-" || !token.startsWith("-")) operands.push(token);
		else if (token === "--") onlyOperands = true;
		else if (token.startsWith("--")) {
			const eq = token.indexOf("=");
			const name = eq < 0 ? token : token.slice(0, eq);
			if (eq >= 0) opts.push({ name, value: token.slice(eq + 1) });
			else if (long.includes(name)) opts.push({ name, value: args[++i] ?? "" });
			else opts.push({ name });
		} else {
			for (let j = 1; j < token.length; j++) {
				const c = token[j] ?? "";
				if (short.includes(c)) {
					opts.push({ name: `-${c}`, value: token.slice(j + 1) || (args[++i] ?? "") });
					break;
				}
				opts.push({ name: `-${c}` });
				if (stop.includes(c)) break;
			}
		}
	}
	return { opts, operands };
}

/** Redirections are not operands (`cp x .uma/y 2>/dev/null` must still see `.uma/y` as the last one). */
function withoutRedirects(args: string[]): string[] {
	const out: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const token = args[i] ?? "";
		if (/^&?\d*>>?$/.test(token) || /^\d*<{1,3}-?$/.test(token)) i++;
		else if (/^&?\d*>/.test(token) || /^\d*</.test(token)) continue;
		else out.push(token);
	}
	return out;
}

/** Paths a `w`/`W` command or `s///w` flag of a sed script writes to (to end of line). */
function sedWriteTargets(script: string): string[] {
	return [...script.matchAll(/(?:^|[;{}\s/|,#@!])[gIimpe0-9]*[wW]\s*([^\n]*)/g)].map((m) => m[1] ?? "");
}

/** sed: the script (first operand without -e/-f, or the -e values) is not a file; the files and any
 *  `w` target in the script are. `-f FILE` is a read of a script. */
function sedTargets(args: string[]): string[] {
	const p = parseArgs(args, "efl", ["--expression", "--file", "--line-length"], "i");
	const scripts = p.opts.filter((o) => o.name === "-e" || o.name === "--expression").map((o) => o.value ?? "");
	const operands = [...p.operands];
	if (scripts.length === 0 && !p.opts.some((o) => o.name === "-f" || o.name === "--file")) {
		const script = operands.shift();
		if (script !== undefined) scripts.push(script);
	}
	return [...operands, ...scripts.flatMap(sedWriteTargets)];
}

/** cp/mv/install/rsync/ln: the destination (last operand or `-t DIR`) is written; `mv` (and rsync
 *  with `--remove-source-files`) also removes its sources; `install -d` makes every operand. */
function transferTargets(cmd: string, args: string[]): string[] {
	const short = cmd === "rsync" ? "efTM" : cmd === "install" ? "tSmog" : "tS";
	const long = cmd === "rsync" ? ["--exclude", "--include", "--filter", "--rsh", "--log-file", "--backup-dir", "--temp-dir"] : ["--target-directory", "--suffix", "--mode", "--owner", "--group"];
	const p = parseArgs(args, short, long);
	if (cmd === "install" && p.opts.some((o) => o.name === "-d" || o.name === "--directory")) return p.operands;
	const dir = cmd === "rsync" ? undefined : p.opts.find((o) => o.name === "-t" || o.name === "--target-directory")?.value;
	const writes = dir !== undefined ? [dir] : p.operands.slice(-1);
	const sources = dir !== undefined ? p.operands : p.operands.slice(0, -1);
	if (cmd === "mv" || p.opts.some((o) => o.name === "--remove-source-files" || o.name === "--remove-sent-files")) writes.push(...sources);
	for (const o of p.opts) if (o.name === "--log-file" || o.name === "--backup-dir") writes.push(o.value ?? "");
	return writes;
}

/** The arguments of a mutating utility that name what it writes. Expression/value text is not one;
 *  a utility without a parser here (python, node, cmd.exe builtins, cmdlets…) keeps every argument
 *  (fail-closed), so `node --eval="…writeFileSync('.uma/x',…)"` cannot hide in an option. */
function mutatedOperands(cmd: string, args: string[]): string[] {
	switch (cmd) {
		case "sed":
			return sedTargets(args);
		case "cp":
		case "mv":
		case "install":
		case "rsync":
		case "ln":
			return transferTargets(cmd, args);
		case "tee":
		case "rm":
		case "chmod":
		case "chown":
		case "chgrp":
			return parseArgs(args, "", ["--reference"]).operands;
		case "touch":
			return parseArgs(args, "rdt", ["--reference", "--date", "--time"]).operands;
		case "truncate":
			return parseArgs(args, "sr", ["--size", "--reference"]).operands;
		case "dd":
			return args.filter((a) => a.startsWith("of=")).map((a) => a.slice(3));
		default:
			return args;
	}
}

/** True when the segment's effective command is a file-mutating utility and
 *  one of the files it mutates is a store path (see mutatedOperands). */
function utilityWritesStore(tokens: string[]): boolean {
	const rest = unwrapAll(tokens);
	const cmd = executableName(rest[0] ?? "");
	if (!cmd || !MUTATING_UTILS.has(cmd)) return false;
	return mutatedOperands(cmd, withoutRedirects(rest.slice(1))).some(tokenTouchesStore);
}

/** True when a shell segment persists into a store: an output redirection into
 *  a store path, or a mutating utility naming one. A store path that is only
 *  NAMED (`ls .uma/ 2>/dev/null`) is a read and stays allowed. */
function commandWritesMemoryPath(command: string): boolean {
	return segments(command).some((tokens) => redirectWritesStore(tokens) || utilityWritesStore(tokens));
}

/**
 * True when a bash command can persist memory behind the approved tools: a UMA
 * binary invocation (quoted or `uma-cli`, any subcommand that writes), or a
 * shell-level write into a store path.
 */
export function isBypassingBashCommand(command: string): boolean {
	for (const tokens of segments(command)) {
		// Env assignments, transparent wrappers and shell bodies never make a different binary the real command.
		const rest = unwrapAll(tokens);
		if (isUmaExecutable(rest[0] ?? "") && subcommandMutatesMemory(rest.slice(1))) return true;
	}
	return commandWritesMemoryPath(command);
}

/** One `uma muscle run <name> --confirm` found in a shell command. */
export interface MuscleRun {
	/** Routine name; empty when the command gives none. */
	name: string;
	/** The `--plan-hash` value; undefined when the flag is missing or has no value. */
	planHash: string | undefined;
}

/** Flags of `uma muscle run` that take a value in the next token (the `--flag=value` form is one token). */
const MUSCLE_VALUE_FLAGS = new Set(["--plan-hash"]);

/** The run this segment makes, or undefined when its effective command is not `uma muscle run … --confirm`. */
function muscleRunOf(tokens: string[]): MuscleRun | undefined {
	const rest = unwrapAll(tokens);
	if (!isUmaExecutable(rest[0] ?? "")) return undefined;
	const args = rest.slice(1);
	if (args[0]?.toLowerCase() !== "muscle" || args[1]?.toLowerCase() !== "run") return undefined;
	const operands = args.slice(2);
	if (!operands.some((t) => t.toLowerCase() === "--confirm")) return undefined;
	let name = "";
	let planHash: string | undefined;
	for (let i = 0; i < operands.length; i++) {
		const token = operands[i] ?? "";
		const flag = token.toLowerCase();
		if (flag.startsWith("--plan-hash=")) {
			planHash = token.slice("--plan-hash=".length) || undefined;
		} else if (MUSCLE_VALUE_FLAGS.has(flag)) {
			const value = operands[i + 1];
			planHash = value !== undefined && !value.startsWith("-") ? value : undefined;
			i++;
		} else if (!token.startsWith("-") && !name) {
			name = token;
		}
	}
	return { name, planHash };
}

/**
 * The routines a shell command would run with `--confirm` (one per segment), and
 * whether the command also does something else that changes memory. A command
 * with `other` set is not one routine run, so the gate refuses it whole.
 */
export function musclePlanOfCommand(command: string): { runs: MuscleRun[]; other: boolean } {
	const runs: MuscleRun[] = [];
	let other = false;
	for (const tokens of segments(command)) {
		const run = muscleRunOf(tokens);
		if (run) runs.push(run);
		const rest = unwrapAll(tokens);
		const mutatesViaUma = !run && isUmaExecutable(rest[0] ?? "") && subcommandMutatesMemory(rest.slice(1));
		if (mutatesViaUma || redirectWritesStore(tokens) || utilityWritesStore(tokens)) other = true;
	}
	return { runs, other };
}
