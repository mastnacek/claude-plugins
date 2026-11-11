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
 * store on any platform). Separators and case are normalized; the three real
 * global layouts are known:
 *   Windows: %APPDATA%\uma\uma\data\global
 *   macOS:   ~/Library/Application Support/com.uma.uma/global
 *   Linux:   ~/.local/share/uma/global
 */
export function isUmaMemoryFilePath(targetPath: string): boolean {
	const norm = targetPath.replace(/\\/g, "/").toLowerCase();
	if (norm.includes("/.uma/") || norm.startsWith(".uma/") || norm.endsWith("/.uma") || norm === ".uma") return true;
	const globalMarkers = ["/uma/uma/data/global/", "/uma/data/global/", "/com.uma.uma/global/", "/.local/share/uma/global/"];
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

/** Splits a shell line into command segments (crude, but quote-tolerant). */
function segments(command: string): string[][] {
	return withoutHeredocBodies(command)
		.split(/[|;&\n]+/)
		.map((s) => s.trim())
		.filter(Boolean)
		.map((s) => s.split(/\s+/).map((t) => t.replace(/^["'`]+|["'`]+$/g, "")));
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
	return norm.includes("uma/uma/data/global") || norm.includes("uma/data/global") || norm.includes("com.uma.uma/global") || norm.includes(".local/share/uma/global");
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
	"install", "rsync", "python", "python3", "perl", "node",
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

/** True when the segment's effective command is a file-mutating utility and
 *  some other token touches a store path. Every token except the command
 *  itself counts as an operand — flags included, so `dd of=.uma/x` and
 *  `node --eval="...writeFileSync('.uma/x',...)"` cannot hide in an option. */
function utilityWritesStore(tokens: string[]): boolean {
	for (const skipEnv of [false, true]) {
		const cmdIdx = commandIndexAfter(tokens, skipEnv);
		const cmd = executableName(tokens[cmdIdx] ?? "");
		if (cmd && MUTATING_UTILS.has(cmd)) return tokens.some((t, idx) => idx !== cmdIdx && tokenTouchesStore(t));
	}
	// The same check on the body of a shell wrapper.
	const body = unwrapAll(tokens);
	if (body !== tokens && body.length > 0 && MUTATING_UTILS.has(executableName(body[0] ?? ""))) {
		return body.some((t, idx) => idx !== 0 && tokenTouchesStore(t));
	}
	return false;
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
