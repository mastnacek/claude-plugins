// The plugin's type contract: every value it keeps in $.state, under its name.
// Add a key here before any atom reads or writes it; `claude plugin validate`
// holds the module to this list.

/** One place where `anon scan` found something; never the value itself. */
export type FindingLine = { line: number; column: number; kind: string; rule: string; chars: number };

/** All findings of one file, path short (relative to the session directory). */
export type FileFindings = { path: string; lines: FindingLine[] };

/** What the card under a tool row shows: the findings, and after the decision the outcome. */
export type ToolCard = { groups: FileFindings[]; decision: { isAllowed: boolean; style: string } | null };

declare module "claude-code" {
	interface PluginState {
		"cc-data-anonymizer": {
			/** What the consent pane is asking about right now; null when no pane is open. */
			findings: FileFindings[] | null;
			/** Cards under tool rows, by tool_use_id; null before the first one. */
			cards: Record<string, ToolCard> | null;
			/** Why a tool input could not be fully restored (style redact); null when there is nothing to warn about. */
			redactWarning: string | null;
		};
	}
}
