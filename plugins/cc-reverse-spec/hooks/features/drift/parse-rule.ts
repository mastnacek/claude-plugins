// parse-rule.ts — reads the top-level keys of a rule file (no YAML library).
//
// Enough for the checks: the scalar after `id:` / `confidence:` and whether
// `source:` / `verified_by:` hold at least one item. Known limits: a `#`
// inside a quoted scalar is taken as a comment; nesting is not followed.

export type ParsedRule = {
	id?: string;
	confidence?: string;
	/** Item count of a list key; `undefined` when the key is absent. */
	source?: number;
	verifiedBy?: number;
};

type Entry = { inline: string; items: number };

function scalar(raw: string): string {
	const noComment = raw.replace(/(^|\s)#.*$/, "").trim();
	return noComment.replace(/^(["'])(.*)\1$/, "$2");
}

function topLevel(text: string): Map<string, Entry> {
	const keys = new Map<string, Entry>();
	let current: Entry | undefined;
	for (const line of text.split(/\r?\n/)) {
		if (/^\s*(#.*)?$/.test(line)) continue;
		const key = /^([A-Za-z_][\w-]*):(.*)$/.exec(line);
		if (key) {
			current = { inline: scalar(key[2] ?? ""), items: 0 };
			keys.set(key[1] ?? "", current);
		} else if (current && /^\s*-(\s|$)/.test(line)) {
			current.items += 1;
		}
	}
	return keys;
}

function listCount(entry: Entry | undefined): number | undefined {
	if (!entry) return undefined;
	if (entry.inline === "" ) return entry.items;
	if (/^\[\s*\]$/.test(entry.inline)) return 0;
	return 1; // inline flow list with content: [a, b]
}

export function parseRule(text: string): ParsedRule {
	const keys = topLevel(text);
	const id = keys.get("id")?.inline;
	const confidence = keys.get("confidence")?.inline;
	return {
		...(id ? { id } : {}),
		...(confidence ? { confidence } : {}),
		...(keys.has("source") ? { source: listCount(keys.get("source")) } : {}),
		...(keys.has("verified_by") ? { verifiedBy: listCount(keys.get("verified_by")) } : {}),
	};
}
