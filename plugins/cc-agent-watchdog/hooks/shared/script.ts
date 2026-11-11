// script.ts — file writes hidden in an interpreter's script (python / node / ruby / perl, heredoc or -c).
// The shell tokenizer drops heredoc bodies, so this reads the raw command line. Heuristic: a write call
// in the text is a write; its target is the literal path when there is one, else "?".

import { nameOf } from "./shell";
import type { Cmd } from "./shell";

const INTERPRETERS = new Set(["python", "python3", "python2", "node", "nodejs", "deno", "bun", "ruby", "perl"]);

/** Does any command of the line run an interpreter (so its script text is worth reading). */
export const runsInterpreter = (cmds: readonly Cmd[]): boolean => cmds.some((c) => INTERPRETERS.has(nameOf(c)) || /^python[\d.]*$/.test(nameOf(c)));

const Q = `["']`;
const LITERAL = `${Q}([^"']+)${Q}`;

/** Targets written by the script text: literal paths, or "?" for a write whose path is not a literal. Empty = it only reads. */
export function scriptWrites(text: string): string[] {
	const out: string[] = [];
	// python: open("f", "w" | "a" | "x" | "r+" | "wb" …); the mode decides, a plain read has none of w a x +
	for (const m of text.matchAll(new RegExp(`\\bopen\\(\\s*([^,)]*?)\\s*,\\s*(?:mode\\s*=\\s*)?${Q}([rwaxbt+U]*)${Q}`, "g"))) {
		if (!/[wax+]/.test(m[2] ?? "")) continue;
		out.push(literalOf(m[1] ?? ""));
	}
	// python: open(f).write(…) — a file opened without a mode is read-only, so this is a bug or a write on a handle; count it as a write
	for (const m of text.matchAll(/\bopen\(\s*([^,)]*)\)\s*\.write\(/g)) out.push(literalOf(m[1] ?? ""));
	// python pathlib: Path("f").write_text(…) / x.write_bytes(…)
	for (const m of text.matchAll(/(?:\bPath\(\s*(["'])([^"']+)\1\s*\)\s*)?\.write_(?:text|bytes)\(/g)) out.push(m[2] ?? "?");
	// node / deno / bun: fs.writeFileSync("f", …), appendFile, fs.promises.writeFile
	for (const m of text.matchAll(new RegExp(`\\b(?:write|append)File(?:Sync)?\\(\\s*(${LITERAL})?`, "g"))) out.push(m[2] ?? "?");
	// ruby: File.write("f", …) / IO.write
	for (const m of text.matchAll(new RegExp(`\\b(?:File|IO)\\.(?:write|binwrite)\\(\\s*(${LITERAL})?`, "g"))) out.push(m[2] ?? "?");
	return out;
}

/** The literal inside quotes, else "?" (a variable or an expression). */
function literalOf(arg: string): string {
	const m = new RegExp(`^${LITERAL}$`).exec(arg.trim());
	return m?.[1] ?? "?";
}
