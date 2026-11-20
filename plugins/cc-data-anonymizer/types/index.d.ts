// The plugin's type contract: every value it keeps in $.state, under its name.
// Add a key here before any atom reads or writes it; `claude plugin validate`
// holds the module to this list.

/**
 * One place where `anon scan` found something. `shown` is the value as the person may see it
 * (partial or full, by the `reveal` option); the raw value is never kept. UI only.
 */
export type FindingLine = { line: number; column: number; kind: string; rule: string; chars: number; shown?: string };

/** All findings of one file, path short (relative to the session directory). */
export type FileFindings = { path: string; lines: FindingLine[] };

/** What the card under a tool row shows: the findings, and after the decision the outcome. */
export type ToolCard = { groups: FileFindings[]; decision: { isAllowed: boolean; style: string } | null };

/** One masking operation's outcome for the person: counts and kinds, and values as `reveal` allows. UI only. */
export type MaskNote = {
	count: number;
	kinds: Record<string, number>;
	style: string;
	values: { kind: string; text: string }[];
};

declare module "claude-code" {
	interface PluginState {
		"cc-data-anonymizer": {
			/** What the consent pane is asking about right now; null when no pane is open. */
			findings: FileFindings[] | null;
			/** Cards under tool rows, by tool_use_id; null before the first one. */
			cards: Record<string, ToolCard> | null;
			/** What masking did for a tool call, by tool_use_id; drawn under its row. Never sent to the model. */
			notes: Record<string, MaskNote> | null;
			/** What masking did for a prompt and its @ files, by the key of the submitted text; drawn under the message. */
			promptNotes: Record<string, MaskNote> | null;
			/** Tags «REDACTED:kind:n» anon issued to this session (from its masked output); an input tag outside this list is denied. */
			issuedTags: string[] | null;
		};
	}
}
