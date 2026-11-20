// toml.ts — a small TOML reader for herdr-plugin.toml. Pure; no `$`.
//
// Supports what a herdr manifest uses: `key = value` with strings ("…" and '…'), integers, floats,
// booleans and (multi-line) arrays of those; `[table]` and `[[array-of-tables]]` headers; `#` comments.
// Anything else (inline tables, dates, multi-line strings) is a parse error with its line number.

export type TomlValue = string | number | boolean | TomlValue[] | TomlTable;
export type TomlTable = { [key: string]: TomlValue };

export class TomlError extends Error {}

const KEY = /^[A-Za-z0-9_-]+$/;

/** `text` without its trailing comment (a `#` outside a string) and without surrounding blanks. */
function stripComment(text: string): string {
	let quote = "";
	for (let i = 0; i < text.length; i++) {
		const c = text[i] as string;
		if (quote) {
			if (c === "\\" && quote === '"') i++;
			else if (c === quote) quote = "";
		} else if (c === '"' || c === "'") quote = c;
		else if (c === "#") return text.slice(0, i).trim();
	}
	return text.trim();
}

/** Net bracket depth of `text`, ignoring brackets inside strings. */
function depth(text: string): number {
	let d = 0;
	let quote = "";
	for (let i = 0; i < text.length; i++) {
		const c = text[i] as string;
		if (quote) {
			if (c === "\\" && quote === '"') i++;
			else if (c === quote) quote = "";
		} else if (c === '"' || c === "'") quote = c;
		else if (c === "[") d++;
		else if (c === "]") d--;
	}
	return d;
}

const ESCAPES: Record<string, string> = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", '"': '"', "\\": "\\" };

/** Reads a basic or literal string at the start of `s`; returns the value and the rest. */
function readString(s: string, line: number): [string, string] {
	const q = s[0] as string;
	let out = "";
	for (let i = 1; i < s.length; i++) {
		const c = s[i] as string;
		if (c === q) return [out, s.slice(i + 1)];
		if (q === '"' && c === "\\") {
			const n = s[++i] as string;
			if (n === "u") {
				out += String.fromCodePoint(Number.parseInt(s.slice(i + 1, i + 5), 16));
				i += 4;
			} else if (n in ESCAPES) out += ESCAPES[n];
			else throw new TomlError(`line ${line}: bad escape \\${n}`);
		} else out += c;
	}
	throw new TomlError(`line ${line}: unterminated string`);
}

/** Reads one value at the start of `s`; returns it and the rest. */
function readValue(s: string, line: number): [TomlValue, string] {
	const t = s.trimStart();
	if (t.startsWith('"') || t.startsWith("'")) return readString(t, line);
	if (t.startsWith("[")) {
		const items: TomlValue[] = [];
		let rest = t.slice(1).trimStart();
		while (!rest.startsWith("]")) {
			if (rest === "") throw new TomlError(`line ${line}: unterminated array`);
			const [v, after] = readValue(rest, line);
			items.push(v);
			rest = after.trimStart();
			if (rest.startsWith(",")) rest = rest.slice(1).trimStart();
			else if (!rest.startsWith("]")) throw new TomlError(`line ${line}: expected "," or "]" in array`);
		}
		return [items, rest.slice(1)];
	}
	const m = /^[^\s,\]]+/.exec(t);
	const word = m ? m[0] : "";
	if (word === "true") return [true, t.slice(4)];
	if (word === "false") return [false, t.slice(5)];
	if (/^[+-]?\d[\d_]*(\.\d+)?$/.test(word)) return [Number(word.replace(/_/g, "")), t.slice(word.length)];
	throw new TomlError(`line ${line}: unsupported value "${word || t.slice(0, 12)}"`);
}

/** Walks `path` from `root`, creating tables; the last array-of-tables element is the one entered. */
function enter(root: TomlTable, path: string[], line: number): TomlTable {
	let cur = root;
	for (const key of path) {
		let next = cur[key];
		if (next === undefined) next = cur[key] = {};
		if (Array.isArray(next)) next = next[next.length - 1] as TomlValue;
		if (typeof next !== "object" || next === null || Array.isArray(next)) throw new TomlError(`line ${line}: "${key}" is not a table`);
		cur = next;
	}
	return cur;
}

export function parseToml(source: string): TomlTable {
	const root: TomlTable = {};
	let table = root;
	const lines = source.split(/\r\n|\r|\n/);
	for (let i = 0; i < lines.length; i++) {
		const n = i + 1;
		let text = stripComment(lines[i] as string);
		if (text === "") continue;
		const header = /^(\[\[?)\s*([^\]]+?)\s*\]\]?$/.exec(text);
		if (header && !text.includes("=")) {
			const path = (header[2] as string).split(".").map((k) => k.trim());
			if (!path.every((k) => KEY.test(k))) throw new TomlError(`line ${n}: bad table name "${header[2]}"`);
			if (header[1] === "[[") {
				const parent = enter(root, path.slice(0, -1), n);
				const last = path[path.length - 1] as string;
				const list = parent[last] ?? (parent[last] = []);
				if (!Array.isArray(list)) throw new TomlError(`line ${n}: "${last}" is not an array of tables`);
				const created: TomlTable = {};
				list.push(created);
				table = created;
			} else table = enter(root, path, n);
			continue;
		}
		const eq = text.indexOf("=");
		const key = eq < 0 ? "" : text.slice(0, eq).trim();
		if (!KEY.test(key)) throw new TomlError(`line ${n}: expected "key = value"`);
		text = text.slice(eq + 1).trim();
		while (depth(text) > 0 && i + 1 < lines.length) text += ` ${stripComment(lines[++i] as string)}`;
		const [value, rest] = readValue(text, n);
		if (rest.trim() !== "") throw new TomlError(`line ${n}: unexpected text after value`);
		if (key in table) throw new TomlError(`line ${n}: duplicate key "${key}"`);
		table[key] = value;
	}
	return root;
}
