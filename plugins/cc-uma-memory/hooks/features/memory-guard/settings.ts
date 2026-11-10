// settings.ts — pure logic of memory-guard: which layer decides
// `autoMemoryEnabled`, and how to change that one key in a settings file.

export type Source = "globální" | "projekt" | "lokální" | "výchozí";

/** File texts of the three settings layers; null = the file does not exist. */
export type Layers = { global: string | null; project: string | null; local: string | null };

export type MemoryState = { enabled: boolean; source: Source };

function parseObject(text: string): Record<string, unknown> | undefined {
	try {
		const parsed: unknown = JSON.parse(text);
		return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
	} catch {
		return undefined;
	}
}

/** The value a layer defines; a missing file, bad JSON, null or a non-boolean define nothing. */
function definedIn(text: string | null): boolean | undefined {
	if (text === null) return undefined;
	const value = parseObject(text)?.autoMemoryEnabled;
	return typeof value === "boolean" ? value : undefined;
}

/** The last defined value wins: global < project < local; nowhere defined = on (Claude Code's default). */
export function effectiveState(layers: Layers): MemoryState {
	const order: Array<[Source, string | null]> = [
		["lokální", layers.local],
		["projekt", layers.project],
		["globální", layers.global],
	];
	for (const [source, text] of order) {
		const value = definedIn(text);
		if (value !== undefined) return { enabled: value, source };
	}
	return { enabled: true, source: "výchozí" };
}

export type SetResult = { ok: true; text: string } | { ok: false; error: string };

/** Sets only `autoMemoryEnabled`; every other key and its order stays. Unparsable input is an error, never overwritten. */
export function setAutoMemory(text: string | null, value: boolean): SetResult {
	let obj: Record<string, unknown> = {};
	if (text !== null) {
		const parsed = parseObject(text);
		if (!parsed) return { ok: false, error: "soubor není platný JSON objekt" };
		obj = parsed;
	}
	obj.autoMemoryEnabled = value;
	return { ok: true, text: `${JSON.stringify(obj, null, 2)}\n` };
}
