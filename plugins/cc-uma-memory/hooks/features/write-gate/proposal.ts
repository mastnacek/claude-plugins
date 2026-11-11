// proposal.ts — pure parts of the memory-write dialog (port of pi's modal.ts /
// modal_renderer.ts / i18n `cs`, flattened to what `$.ui.ask` can show): the
// proposal model, the preview text, the option labels and the answers' meaning.
// No engine here.

/** The three fields the reviewer can edit. */
export type EditField = "title" | "body" | "tags";

/** What the dialog shows and edits; lives in the hook's loop, never in `$.state`. */
export type Proposal = {
	title: string;
	body: string;
	tags: string[];
	/** The fact's type as the model sent it ("" = the tool's default). */
	type: string;
	/** `global` or a project name (the current one for the tool's "project" default). */
	scope: string;
	/** The scope as it was shown first; unchanged means the call's own scope is kept as sent. */
	initialScope: string;
	projectName: string;
	/** `uma_supersede`: the id of the fact being replaced. */
	supersedes: string | null;
	since: string;
	staleAfter: string;
	template: string;
};

/** Texts of pi's `cs` table, verbatim where pi has them, plus the step-dialog labels. */
export const T = {
	proposalHeader: "🧠 UMA • Návrh zápisu do paměti",
	supersedeHeader: "🔁 UMA • Návrh nahrazení faktu",
	scopeGlobal: "Globální (všechny projekty)",
	scopeProject: "Projekt",
	sinceLabel: "Platí od",
	staleAfterLabel: "Platí do (poté znovu ověřit)",
	templateLabel: "Šablona (nespouští se)",
	noTags: "(žádné tagy)",
	titleLabel: "Název",
	bodyLabel: "Obsah",
	tagsLabel: "Tagy",
	moreLines: "+{n} řádků",
	editPromptTitle: "Upravit název:",
	editPromptBody: "Upravit obsah (Markdown):",
	editPromptTags: "Upravit tagy (oddělené čárkou):",
	immuneDialogTitle: "🛡️ UMA imunitní interceptor",
	dialogProceed: "Ano, pokračovat",
	dialogBlock: "Ne, zablokovat",
} as const;

/** The dialog's chip (AskUserQuestion keeps it to 12 characters). */
export const HEADER = "🧠 Paměť UMA";

/** Main dialog options, exactly. */
export const APPROVE = "✅ Schválit a uložit do paměti";
export const EDIT = "✏️ Upravit (název, obsah, tagy, celý text)";
export const REJECT = "❌ Zamítnout a zahodit";
export const scopeOption = (v: Pick<Proposal, "scope" | "projectName">): string =>
	`🔄 Přepnout rozsah ➔ ${v.scope.toLowerCase() === "global" ? `📁 ${v.projectName}` : "🌐 globální"}`;

/** The edit menu. */
export const PICK_TITLE = "Název";
export const PICK_BODY = "Obsah";
export const PICK_TAGS = "Tagy";
export const PICK_FULL = "📜 Celý text";
/** A field / full-text dialog: back. `DONE` is the required second choice (ask takes 2–4) and means the same. */
export const BACK = "↩ Zpět beze změny";
export const BACK_FULL = "↩ Zpět";
export const DONE = "✅ Hotovo";

/** Body lines in the preview before "… (+N řádků)". */
export const PREVIEW_LINES = 8;
/** Columns the body is wrapped to in the preview. */
export const WRAP_COLUMNS = 72;

/** Badge emoji per fact type, as in pi. */
const TYPE_GLYPHS: Record<string, string> = {
	decision: "⚖️",
	preference: "⭐",
	pattern: "📐",
	skill: "⚡",
	correction: "🔧",
	fact: "📌",
	note: "🗒️",
	task: "🗳️",
	reference: "🔗",
};

/** The scope for display and editing: the tool's "project" default and an empty scope are the current project. */
export function normalizeScope(initial: string, projectName: string): string {
	const lowered = initial.trim().toLowerCase();
	if (lowered === "global") return "global";
	if (lowered === "" || lowered === "project") return projectName;
	return initial;
}

/** The scope after the toggle: global ↔ the current project. */
export function toggleScope(scope: string, projectName: string): string {
	return scope.toLowerCase() === "global" ? projectName : "global";
}

/** The model's `tags` as a list of non-empty strings. */
export function tagsOf(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((t): t is string => typeof t === "string" && t.trim() !== "").map((t) => t.trim()) : [];
}

/** The tags field's text → tags (comma separated). */
export function parseTags(text: string): string[] {
	return text.split(",").map((t) => t.trim()).filter(Boolean);
}

/** Word-wraps to `max` characters; explicit newlines kept, over-long words broken. */
export function wrap(text: string, max: number): string[] {
	const lines: string[] = [];
	for (const raw of text.split("\n")) {
		if (raw.trim() === "") {
			lines.push("");
			continue;
		}
		let current = "";
		for (let word of raw.split(/\s+/)) {
			if (!word) continue;
			while (word.length > max) {
				if (current) {
					lines.push(current);
					current = "";
				}
				lines.push(word.slice(0, max));
				word = word.slice(max);
			}
			if (current === "") current = word;
			else if (current.length + 1 + word.length <= max) current += ` ${word}`;
			else {
				lines.push(current);
				current = word;
			}
		}
		if (current) lines.push(current);
	}
	return lines;
}

const RULE = "─".repeat(32);

/** The main dialog's question: pi's proposal view as text (header, chips, title, 8 body lines). */
export function previewOf(v: Proposal): string {
	const type = v.type || (v.supersedes === null ? "note" : "(jako původní)");
	const glyph = TYPE_GLYPHS[type.toLowerCase()] ?? "📄";
	const scope = v.scope.toLowerCase() === "global" ? `🌐 ${T.scopeGlobal}` : `📁 ${T.scopeProject} (${v.scope})`;
	const body = wrap(v.body || "(prázdné tělo)", WRAP_COLUMNS);
	const lines = [
		v.supersedes === null ? T.proposalHeader : `${T.supersedeHeader} ${v.supersedes}`,
		RULE,
		`${glyph}  ${type.toUpperCase()}   ${scope}`,
		`🏷️  ${T.tagsLabel}: ${v.tags.length > 0 ? v.tags.map((t) => `#${t}`).join(" ") : T.noTags}`,
	];
	if (v.since) lines.push(`⏱ ${T.sinceLabel}: ${v.since}`);
	if (v.staleAfter) lines.push(`⏳ ${T.staleAfterLabel}: ${v.staleAfter}`);
	if (v.template) lines.push(`⌘ ${T.templateLabel}: ${v.template}`);
	lines.push("", `📌 ${T.titleLabel}`, `  ${v.title || "(bez názvu)"}`, "", `📄 ${T.bodyLabel}`);
	for (const l of body.slice(0, PREVIEW_LINES)) lines.push(`    ${l}`);
	if (body.length > PREVIEW_LINES) lines.push(`    … (${T.moreLines.replace("{n}", String(body.length - PREVIEW_LINES))})`);
	return lines.join("\n");
}

/** The dialog for one field: its prompt and the current value. */
export function fieldQuestion(v: Proposal, field: EditField): string {
	const prompt = field === "title" ? T.editPromptTitle : field === "body" ? T.editPromptBody : T.editPromptTags;
	const current = field === "title" ? v.title : field === "body" ? v.body : v.tags.join(", ");
	return `✏️ ${prompt}\n${RULE}\n${current || "(prázdné)"}\n${RULE}\nNová hodnota: napiš ji pod „Type something“.`;
}

/** The full-text dialog's question: the whole body. */
export function fullTextQuestion(v: Proposal): string {
	return `📜 ${T.bodyLabel}: ${v.title}\n${RULE}\n${v.body || "(prázdné tělo)"}\n${RULE}`;
}

/** Applies text typed under "Type something" to a field; empty title/body is ignored. */
export function withField(v: Proposal, field: EditField, text: string): Proposal {
	const t = text.trim();
	if (field === "tags") return { ...v, tags: parseTags(t) };
	return t === "" ? v : { ...v, [field]: t };
}

/** The tool input after approval: the reviewed title, body, tags and scope over the call's own fields. */
export function approvedInput(input: Record<string, unknown>, v: Proposal): Record<string, unknown> {
	const out: Record<string, unknown> = { ...input, title: v.title, body: v.body };
	if (v.tags.length > 0 || input.tags !== undefined) out.tags = v.tags;
	if (v.scope !== v.initialScope) out.scope = v.scope.toLowerCase() === "global" ? "global" : v.projectName;
	return out;
}
