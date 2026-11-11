// shell.ts — a small shell tokenizer for judging Bash commands.
// It understands quotes, escapes, `&&` `||` `;` `|` `&` newlines, `( )` / `$( )`,
// redirects, leading VAR=value, wrappers (env, nohup, timeout N …) and `bash -c "…"`.
// Heredoc bodies are dropped first, so text written to a file is never judged
// as a command. It is a heuristic, not a shell: no variables, no globbing.

export type Redirect = { op: string; target: string };

export type Cmd = {
	/** Command name first, then arguments; quotes removed. */
	words: string[];
	redirects: Redirect[];
	/** Leading `VAR=value` assignments. */
	assigns: string[];
	/** This command's stdin comes from the previous one. */
	pipeIn: boolean;
	/** This command's stdout goes to the next one. */
	pipeOut: boolean;
};

const WRAPPERS = new Set(["env", "command", "nohup", "time", "exec", "nice", "builtin", "stdbuf", "ionice"]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

/** Removes heredoc bodies (`<<EOF … EOF`), keeping the line that opens them. */
export function stripHeredocs(src: string): string {
	const out: string[] = [];
	let end: string | undefined;
	for (const line of src.split("\n")) {
		if (end !== undefined) {
			if (line.trim() === end) end = undefined;
			continue;
		}
		out.push(line);
		const m = /(?<!<)<<(?!<)-?\s*(["']?)([A-Za-z_][\w-]*)\1/.exec(line);
		if (m) end = m[2];
	}
	return out.join("\n");
}

const fresh = (pipeIn = false): Cmd => ({ words: [], redirects: [], assigns: [], pipeIn, pipeOut: false });

function tokenize(src: string): Cmd[] {
	const cmds: Cmd[] = [];
	let cur = fresh();
	let word = "";
	let hasWord = false;
	let redirect: string | undefined;

	const endWord = () => {
		if (!hasWord) return;
		if (redirect !== undefined) {
			cur.redirects.push({ op: redirect, target: word });
			redirect = undefined;
		} else if (cur.words.length === 0 && /^[A-Za-z_]\w*=/.test(word)) cur.assigns.push(word);
		else cur.words.push(word);
		word = "";
		hasWord = false;
	};
	const endCmd = (pipe: boolean) => {
		endWord();
		redirect = undefined;
		if (cur.words.length > 0 || cur.redirects.length > 0 || cur.assigns.length > 0) {
			cur.pipeOut = pipe;
			cmds.push(cur);
			cur = fresh(pipe);
		} else cur.pipeIn = pipe;
	};

	for (let i = 0; i < src.length; i++) {
		const c = src[i] as string;
		const next = src[i + 1];
		if (c === "\\") {
			if (next === "\n") i++;
			else if (next !== undefined) {
				word += next;
				hasWord = true;
				i++;
			}
		} else if (c === "'") {
			const close = src.indexOf("'", i + 1);
			const end = close < 0 ? src.length : close;
			word += src.slice(i + 1, end);
			hasWord = true;
			i = end;
		} else if (c === '"') {
			i++;
			while (i < src.length && src[i] !== '"') {
				if (src[i] === "\\" && i + 1 < src.length) i++;
				word += src[i];
				i++;
			}
			hasWord = true;
		} else if (c === "#" && !hasWord) {
			while (i < src.length && src[i] !== "\n") i++;
			i--;
		} else if (c === "\n" || c === ";") endCmd(false);
		else if (c === "|") {
			if (next === "|") {
				i++;
				endCmd(false);
			} else {
				if (next === "&") i++;
				endCmd(true);
			}
		} else if (c === "&") {
			if (next === "&") {
				i++;
				endCmd(false);
			} else if (next === ">") {
				endWord();
				i += src[i + 2] === ">" ? 2 : 1;
				redirect = ">";
			} else endCmd(false);
		} else if (c === "(" || c === ")") {
			if (c === "(" && word === "$") {
				word = "";
				hasWord = false;
			}
			endCmd(false);
		} else if (c === ">" || c === "<") {
			// `2>`, `1>>`: the digits are the file descriptor, not a word.
			if (hasWord && /^\d+$/.test(word)) {
				word = "";
				hasWord = false;
			} else endWord();
			let op = c;
			if (next === c) {
				op += c;
				i++;
			}
			if (c === ">" && src[i + 1] === "&") {
				// `>&2`, `2>&1`: a duplicate of a descriptor, not a file.
				i++;
				while (i + 1 < src.length && /[\d-]/.test(src[i + 1] as string)) i++;
				continue;
			}
			if (c === ">" && src[i + 1] === "|") i++;
			redirect = op;
		} else if (c === " " || c === "\t" || c === "\r") endWord();
		else {
			word += c;
			hasWord = true;
		}
	}
	endCmd(false);
	return cmds;
}

/** Drops wrappers (`env A=b`, `nohup`, `timeout 5`) so `words[0]` is the real command. */
function unwrap(cmd: Cmd): Cmd {
	const words = [...cmd.words];
	const assigns = [...cmd.assigns];
	for (;;) {
		const name = words[0];
		if (name === undefined) break;
		if (name === "timeout") {
			words.shift();
			while (words[0]?.startsWith("-")) words.shift();
			words.shift();
		} else if (WRAPPERS.has(name)) {
			words.shift();
			while (words[0] !== undefined && (words[0].startsWith("-") || /^[A-Za-z_]\w*=/.test(words[0]))) {
				if (/^[A-Za-z_]\w*=/.test(words[0])) assigns.push(words[0]);
				words.shift();
			}
		} else break;
	}
	return { ...cmd, words, assigns };
}

/** Every simple command of a shell line, in order, with `bash -c "…"` opened up. */
export function parseCommand(command: string, depth = 0): Cmd[] {
	const result: Cmd[] = [];
	for (const raw of tokenize(stripHeredocs(command))) {
		const cmd = unwrap(raw);
		const shell = cmd.words[0];
		const flag = cmd.words.findIndex((w, i) => i > 0 && /^-[a-z]*c$/.test(w));
		if (shell !== undefined && SHELLS.has(shell.replace(/^.*\//, "")) && flag > 0 && cmd.words[flag + 1] !== undefined && depth < 3) {
			result.push(...parseCommand(cmd.words[flag + 1] as string, depth + 1));
		} else result.push(cmd);
	}
	return result;
}

/** The command's base name (`/usr/bin/git` → `git`). */
export const nameOf = (cmd: Cmd): string => (cmd.words[0] ?? "").replace(/^.*\//, "");

/** Arguments that are not options; `withArg` lists options that consume the next word. */
export function positionals(words: readonly string[], withArg: ReadonlySet<string> = new Set()): string[] {
	const out: string[] = [];
	for (let i = 1; i < words.length; i++) {
		const w = words[i] as string;
		if (w === "--") {
			out.push(...words.slice(i + 1));
			break;
		}
		if (withArg.has(w)) i++;
		else if (!w.startsWith("-") || w === "-") out.push(w);
	}
	return out;
}

const GIT_GLOBAL_WITH_ARG = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix"]);

/** `git [global options] <sub> args…` → the subcommand and what follows it. */
export function gitSub(cmd: Cmd): { sub: string; args: string[] } | undefined {
	if (nameOf(cmd) !== "git") return undefined;
	let i = 1;
	while (i < cmd.words.length && (cmd.words[i] as string).startsWith("-")) i += GIT_GLOBAL_WITH_ARG.has(cmd.words[i] as string) ? 2 : 1;
	const sub = cmd.words[i];
	return sub === undefined ? undefined : { sub, args: cmd.words.slice(i + 1) };
}

/** True when any flag of `args` is one of `flags`, or a bundle of short flags that contains the letter. */
export function hasFlag(args: readonly string[], flags: readonly string[]): boolean {
	return args.some((a) => flags.includes(a) || (!a.startsWith("--") && a.startsWith("-") && flags.some((f) => f.length === 2 && f[0] === "-" && a.slice(1).includes(f[1] as string))));
}
