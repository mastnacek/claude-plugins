// The plugin's type contract: every value it keeps in $.state, under its name.
// Add a key here before any atom reads or writes it; `claude plugin validate`
// holds the module to this list.

declare module "claude-code" {
	/** One /uma output as data. */
	type UmaOutput = {
		/** After `🧠 UMA · ` in the header. */
		title: string;
		/** The frame: normal = the plugin's colour, else error / warning / success. */
		tone: "normal" | "error" | "warning" | "success";
		/** Label → value rows (settings, doctor checks, help commands); a `tone` marks the label with a status icon; `hint` is a dim line under it. */
		fields?: Array<{ label: string; value: string; tone?: "error" | "warning" | "success" | "dim"; hint?: string }>;
		/** Numbered entries (facts, drafts, debts); `type` is the coloured label, `score` is shown after ⚖, `lines` are the dim detail lines. */
		items?: Array<{ title: string; type?: string; scope?: string; id?: string; tags?: string[]; score?: string; badge?: { text: string; tone?: "error" | "warning" | "success" | "dim" }; lines?: string[] }>;
		/** Free lines (a sentence, a body, a note). */
		lines?: Array<{ text: string; tone?: "error" | "warning" | "success" | "dim" }>;
	};

	interface PluginState {
		"cc-uma-memory": {
			/**
			 * A /uma output's first line (what the model reads) → the whole output as data, which `uma-command` draws in its row
			 * (round frame, header `🧠 UMA · title`, colours by meaning). Written by uma-command, memory-guard, staging and immune;
			 * order of drawing: `fields`, `items`, `lines`. A `tone` of a field, item, badge or line is the colour from the data
			 * (a state, a severity); without it the drawer decides from the text itself (`classify`). An older stored shape reads as {}.
			 */
			commandOutputs: Shaped<Record<string, UmaOutput>>;
			/** Effective autoMemoryEnabled and the layer that decides it; null until computed at start. */
			memoryState: { enabled: boolean; source: "globální" | "projekt" | "lokální" | "výchozí" } | null;
			/** True once /uma claude-memory changed autoMemoryEnabled in this session (it takes effect next session). */
			memoryChanged: boolean;
			/** Persisted switches (`$.store`, across sessions): recall into prompts, the write approval mode, UMA rules in the system prompt, the immune interceptor's mode and the OpenRouter model of its recommendation ("" = default), the humility gate on/off, the display language of facts (`cs` = facts shown translated to Czech, `en` = as stored; stored facts are English either way). Written only by uma-command. */
			settings: Shaped<{ recall: boolean; writeGate: "ask" | "off"; append: boolean; immune: "off" | "warn" | "ask" | "auto"; immuneModel: string; humility: boolean; shadow: "off" | "on" | "jev"; lang: "cs" | "en" }>;
			/** Recall's memory of this session: ids already inserted (anti-echo) and whether the last run failed (log once per series). */
			recallSession: { session: string; ids: string[]; failing: boolean };
			/** The debt ledger as the last `uma debt check` saw it: open blocking debts (the label under the prompt), reminders spent in this run, whether the next main turn is our own continuation, whether the last check failed. Written only by debt. */
			debtState: { blocking: number; reminders: number; continuing: boolean; failing: boolean };
			/** The humility gate for this session: the intent of the last `uma_humility` check and the unfamiliar directories it flagged (reads counted since, hypothesis confirmed). Written only by humility. */
			humilityState: { session: string; intent: string; since: number; flags: Array<{ dir: string; required: number; reads: string[]; confirmed: boolean }> };
			/** The shadow worker's memory: the last red build/test run with the non-test files changed since (kept up to 5 minutes, until a green one follows) and the last correction it staged (an identical repeat is skipped). Written only by shadow. */
			shadowState: Shaped<{ failure: { command: string; output: string; at: number; edited: string[] } | null; lastCorrection: string }>;
			/** Muscle synthesis's memory of this session: the shapes and raw lines of the last Bash commands that ran without error (at most 40) and the sequences already proposed. Written only by muscle-synthesis. */
			commandHistory: { shapes: string[]; raw: string[]; proposed: string[] };
			/** The drafts waiting in `.uma/.staging/` as the last directory listing saw them (the label ` 📝N` under the prompt). Written only by staging. */
			stagingState: { pending: number };
			/** The rules section for this session's system prompt, fetched once per session (null = not fetched yet, "" = no rules) and whether the last fetch failed (log once per series). */
			rulesSession: { session: string; text: string | null; failing: boolean };
		};
	}
}
