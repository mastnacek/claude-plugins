/**
 * Segment protection: the parts of a prompt or final answer that must survive
 * translation untouched (<file> blocks, code, @ mentions, paths, URLs, tables),
 * and the restore/clean steps that put them back.
 */
import type { ProtectedSegment, ProtectedText } from "../types";

/** One or more consecutive pipe-grid rows. */
const TABLE_BLOCK = /(?:^[ \t]*\|[^\n]*\|[ \t]*$\n?)+/gm;

/** A real table has a header row and a `| --- |` separator on row 2. */
function isTableBlock(block: string): boolean {
	const rows = block.split("\n").filter((l) => l.trim().length > 0);
	return rows.length >= 2 && /^[ \t]*\|[\s:|-]+\|[ \t]*$/.test(rows[1] ?? "");
}

/**
 * Mask each markdown table as one segment. Unmasked, the grid reaches the
 * translator as prose and comes back re-flowed into bare cells, header gone.
 * Trade: the table is not translated — a mangled grid is
 * worse than an English one, and these cells hold ids, paths and verdicts.
 */
function protectTables(text: string, addSegment: (value: string) => string): string {
	return text.replace(TABLE_BLOCK, (match) =>
		// The regex swallows the trailing newline; keeping it would leave a
		// blank line after the restored grid.
		isTableBlock(match) ? addSegment(match.replace(/\n$/, "")) : match,
	);
}

/**
 * Opaque payloads the model must not read: <file> and friends (prompt only).
 * `pasted_content` is what the terminal wraps around a paste, and its closing
 * tag repeats the id (`</pasted_content id="x">`), hence the optional
 * attributes after the closing name. Unprotected, a boost prompt ("drop
 * filler") dropped a whole pasted block.
 */
const EMBEDDED_BLOCK = /<(file|context|document|code|snippet|pasted_content)\b[^>]*>[\s\S]*?<\/\1\b[^>]*>/gi;

/**
 * Masked in both directions, in this order (after tables, so a table costs one
 * segment, not one per code span inside it). Without the code rules a ```ts
 * sample comes back with renamed identifiers or broken syntax.
 */
const SHARED_MASKS: readonly RegExp[] = [
	// multi-line code blocks, inline code
	/```[\s\S]*?```/g,
	/`[^`\n]+`/g,
	// @ file mentions (@src/file.ts, @"quoted file.ts")
	/@"[^"\n]+"|@[\w][\w./-]*/g,
	// web, git and file URLs
	/(?:https?|git\+https?|ftp|file):\/\/[^\s<>)"]+?(?=[.,;:!?]*(?:\s|[<>)"]|$))/g,
	// Windows absolute paths (C:\foo\bar, D:/foo/bar) and UNC paths (\\server\share\...)
	/\b[A-Za-z]:[\\/](?:[^\s<>"'`{}()[\]]*[^\s<>"'`{}()[\].,;:!?])?/g,
	/\\\\[a-zA-Z0-9_.-]+\\[^\s<>"'`{}()[\]]*[^\s<>"'`{}()[\].,;:!?]/g,
	// Unix absolute and home paths, then relative paths (./..., ../...)
	/(?<=^|[\s<>"'`{}()[\]])(?:~|\/tmp|\/var|\/home|\/etc|\/usr|\/opt|\/srv|\/root|\/mnt|\/Volumes|\/Users)\/[^\s<>"'`{}()[\]]*[^\s<>"'`{}()[\].,;:!?]/g,
	/(?<=^|[\s<>"'`{}()[\]])(?:\.{1,2}[\\/])[^\s<>"'`{}()[\]]*[^\s<>"'`{}()[\].,;:!?]/g,
];

/**
 * User-written `!term!`: the explicit "do not translate this" syntax, rewritten
 * into <keep> tags the model sees and passes through (`stripKeepTags` drops them
 * afterwards). Runs after masking, so a marker inside code, a path or a URL is
 * already gone. `[^\s!]+` is load-bearing: with `[^!]+` the Czech sentence
 * "Pozor! To je chyba!" would become one protected span. Single token only;
 * use <keep>a b</keep> for a phrase.
 */
const KEEP_MARKER = /!([^\s!]+)!/g;

function mask(text: string, leading: readonly RegExp[]): ProtectedText {
	const segments: ProtectedSegment[] = [];
	const addSegment = (value: string) => {
		const placeholder = `__PI_PROMPT_TRANSLATE_PROTECTED_${segments.length}__`;
		segments.push({ placeholder, value });
		return placeholder;
	};
	let masked = text;
	for (const re of leading) masked = masked.replace(re, addSegment);
	masked = protectTables(masked, addSegment);
	for (const re of SHARED_MASKS) masked = masked.replace(re, addSegment);
	return { text: masked, segments };
}

export function protectPromptSegments(text: string): ProtectedText {
	const result = mask(text, [EMBEDDED_BLOCK]);
	return { ...result, text: result.text.replace(KEEP_MARKER, (_match, term: string) => `<keep>${term}</keep>`) };
}

export function protectFinalAnswerSegments(text: string): ProtectedText {
	return mask(text, []);
}

/**
 * True when the payload's bare text is already present in the restored answer.
 *
 * The segment value keeps its markdown delimiters (`` `code` ``, `*bold*`), but a
 * translation model reliably drops them: it sees `__PI_..._0__`, emits the meaning
 * in prose, and hands back `code` without the backticks. Comparing the delimited
 * form therefore never matches and the recovery re-appends a duplicate of text that
 * is already right there. Only the wrapping delimiters come off — underscores
 * inside an identifier must survive, or `sub_HledejLidyIFX.lss` stops matching.
 *
 * Short values are treated as absent: at three characters an ordinary Czech word
 * would satisfy `includes` by coincidence and the recovery would silently drop
 * genuinely lost content.
 */
const BARE_MIN_LENGTH = 4;

function hasBareValue(restored: string, value: string): boolean {
	const bare = value
		.replace(/`/g, "")
		.replace(/^[*]+|[*]+$/g, "")
		.replace(/^_+|_+$/g, "")
		.trim();
	if (bare.length < BARE_MIN_LENGTH) return false;
	return restored.includes(bare);
}

export function restoreProtectedSegments(
	text: string,
	segments: ProtectedSegment[],
	stats?: { appended: number },
): string {
	let restored = text;
	for (const segment of segments) {
		if (restored.includes(segment.placeholder)) {
			restored = restored.split(segment.placeholder).join(segment.value);
		} else {
			// Fallback: handle slight model formatting mutations (missing underscores
			// or spaces, different casing). Global, because the model repeating one
			// placeholder is legitimate (it references the same file twice) and
			// restoring only the first would hand the agent a literal
			// __PI_PROMPT_TRANSLATE_PROTECTED_0__ in its own answer. The exact-match
			// branch above already replaces every occurrence; this branch must not be
			// the weaker one.
			//
			// Anchored and space-only: the pattern has to match the whole placeholder
			// token. An unanchored `\s` also spans newlines, so a dropped underscore
			// used to match placeholder text split across two lines.
			const fuzzyRegex = new RegExp(
				`(^|[^A-Za-z0-9_])${segment.placeholder.replace(
					/_/g,
					"[_ ]?",
				)}(?![A-Za-z0-9_])`,
				"gi",
			);
			if (fuzzyRegex.test(restored)) {
				restored = restored.replace(fuzzyRegex, `$1${segment.value}`);
			} else if (!hasBareValue(restored, segment.value)) {
				// Safety recovery: if the placeholder was completely dropped by the
				// model, append the protected payload so critical code, links, or files
				// are not lost.
				//
				// Only when the value is genuinely absent. Without this check the
				// recovery re-appends anything the model already emitted on its own —
				// an answer dense in inline code came back with every path, id and URL
				// duplicated as a trailing list, because the model dropped the
				// placeholders but kept their meaning.
				restored = `${restored.trimEnd()}\n\n${segment.value}`;
				if (stats) stats.appended += 1;
			}
		}
	}
	return restored;
}

/**
 * Drop the visible <keep> markers added for `!term!`, keeping the wrapped term.
 * The term itself is never re-inserted from a segment table: the model already
 * had it in view, so the worst case is a mangled term, not silently lost content.
 */
export function stripKeepTags(text: string): string {
	return text.replace(/<\/?keep>/g, "");
}

export function cleanTranslationOutput(
	text: string,
	tag: string = "source_text",
): string {
	let cleaned = text.trim();
	// Strip the wrapper this request actually used (a random per-request tag), and
	// keep the literal names as a fallback for models that echo the old contract.
	const tagAlternatives = [
		tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
		"(?:source_text|translation)",
	].join("|");
	const tagMatch = cleaned.match(
		new RegExp(
			`^<(${tagAlternatives})>\\s*([\\s\\S]*?)\\s*<\\/\\1>$`,
			"i",
		),
	);
	if (tagMatch) {
		cleaned = (tagMatch[2] ?? "").trim();
	}
	// Strip accidental echoing of conversation_context if any
	cleaned = cleaned
		.replace(/<conversation_context>[\s\S]*?<\/conversation_context>/gi, "")
		.trim();
	// Belt and braces: if a per-request tag survives anywhere in the output (the
	// model echoing our scaffolding mid-answer), drop it rather than show the user
	// the internal tag name.
	if (tag !== "source_text") {
		const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		cleaned = cleaned
			.replace(new RegExp(`</?${escaped}>`, "gi"), "")
			.trim();
	}
	return cleaned;
}
