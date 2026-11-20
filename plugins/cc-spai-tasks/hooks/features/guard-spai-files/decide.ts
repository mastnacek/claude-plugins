// decide.ts — may this tool call touch a SPAI record by hand? Pure: no disk, no engine.
//
// A SPAI record is a `.md` file (or `.index.json`) under a `docs/spai/` (older: `.pi/spai/`)
// folder. Only the `spai` binary writes (`add`, `set`) and deletes (`delete`) them.

export const DENY = "Záznamy SPAI zapisuje jen `spai` — použij `spai add` / `spai set` (skill spai).";
export const DENY_DELETE = "Záznamy SPAI maže jen `spai delete` (skill spai).";

/** Is this path a SPAI record? Both slashes, any case (Windows). */
export function isSpaiRecord(path: string): boolean {
	const parts = path.replace(/\\/g, "/").toLowerCase().split("/").filter((p) => p !== "" && p !== ".");
	const last = parts[parts.length - 1] ?? "";
	if (!last.endsWith(".md") && last !== ".index.json") return false;
	// the folder pair must sit before the file name
	return parts.slice(0, -1).some((p, i, dirs) => p === "spai" && (dirs[i - 1] === "docs" || dirs[i - 1] === ".pi"));
}

/** Words and operators of a shell line, quote-aware. `\` stays literal (Windows paths). */
type Tok = { kind: "word"; text: string } | { kind: "sep" } | { kind: "redir" };

function tokenize(line: string): Tok[] {
	const out: Tok[] = [];
	let cur = "";
	let has = false;
	let quote: string | null = null;
	const flush = () => {
		if (has) out.push({ kind: "word", text: cur });
		cur = "";
		has = false;
	};
	for (let i = 0; i < line.length; i++) {
		const c = line[i] as string;
		if (quote) {
			if (c === quote) quote = null;
			else cur += c;
		} else if (c === '"' || c === "'") {
			quote = c;
			has = true;
		} else if (c === ">") {
			// `2>`, `>>`: a leading fd digit belongs to the operator
			if (!has || /^\d+$/.test(cur)) {
				cur = "";
				has = false;
			} else flush();
			while (line[i + 1] === ">") i++;
			out.push({ kind: "redir" });
		} else if (c === "|" || c === ";" || c === "&" || c === "\n" || c === "(" || c === ")") {
			flush();
			if (!(out[out.length - 1]?.kind === "sep")) out.push({ kind: "sep" });
		} else if (c === " " || c === "\t" || c === "\r") flush();
		else {
			cur += c;
			has = true;
		}
	}
	flush();
	return out;
}

const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Command name without folder and `.exe`. */
const nameOf = (word: string): string => (word.replace(/\\/g, "/").split("/").pop() ?? "").toLowerCase().replace(/\.exe$/, "");

/** Does this simple command (words after the command name) write to a record? */
function writesRecord(cmd: string, args: string[]): boolean {
	const plain = args.filter((a) => !a.startsWith("-"));
	switch (cmd) {
		case "tee":
			return plain.some(isSpaiRecord);
		case "sed":
			return args.some((a) => a === "--in-place" || a.startsWith("--in-place=") || /^-[A-Za-z]*i/.test(a)) && plain.some(isSpaiRecord);
		case "cp":
		case "mv": {
			const target = plain[plain.length - 1];
			return plain.length >= 2 && target !== undefined && isSpaiRecord(target);
		}
		default:
			return false;
	}
}

const DELETERS = new Set(["rm", "del", "erase", "remove-item", "ri", "unlink"]);

/** Does this simple command delete a record (`rm`, `git rm`, `del`, `Remove-Item`, `unlink`)? */
function deletesRecord(cmd: string, args: string[]): boolean {
	const plain = args.filter((a) => !a.startsWith("-")).flatMap((a) => a.split(","));
	if (cmd === "git") return plain[0] === "rm" && plain.slice(1).some(isSpaiRecord);
	return DELETERS.has(cmd) && plain.some(isSpaiRecord);
}

/** Does this shell command obviously write to a record? Reading passes; when unsure, false. */
export function bashWritesRecord(command: string): boolean {
	return scan(command, writesRecord, true);
}

/** Does this shell command obviously delete a record? Reading passes; when unsure, false. */
export function bashDeletesRecord(command: string): boolean {
	return scan(command, deletesRecord, false);
}

/** Walks the simple commands of a shell line; `redirects`: a `>` into a record counts too. */
function scan(command: string, test: (cmd: string, args: string[]) => boolean, redirects: boolean): boolean {
	let words: string[] = [];
	let redirect = false;
	const done = (): boolean => {
		let i = 0;
		while (i < words.length && ENV_ASSIGN.test(words[i] as string)) i++;
		const cmd = words[i];
		const hit = cmd !== undefined && test(nameOf(cmd), words.slice(i + 1));
		words = [];
		return hit;
	};
	for (const t of tokenize(command)) {
		if (t.kind === "redir") redirect = true;
		else if (t.kind === "sep") {
			redirect = false;
			if (done()) return true;
		} else if (redirect) {
			redirect = false;
			if (redirects && isSpaiRecord(t.text)) return true;
		} else words.push(t.text);
	}
	return done();
}

/** The reason to refuse a tool call, or `null` to let it through. */
export function decide(tool: string, input: { file_path?: unknown; notebook_path?: unknown; command?: unknown }): string | null {
	if (tool === "Bash") {
		if (typeof input.command !== "string") return null;
		if (bashDeletesRecord(input.command)) return DENY_DELETE;
		return bashWritesRecord(input.command) ? DENY : null;
	}
	const path = tool === "NotebookEdit" ? input.notebook_path : input.file_path;
	return typeof path === "string" && isSpaiRecord(path) ? DENY : null;
}
