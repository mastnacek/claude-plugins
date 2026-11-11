// The plugin's type contract: every value it keeps in $.state, under its name.
// Add a key here before any atom reads or writes it; `claude plugin validate`
// holds the module to this list.

declare module "claude-code" {
	interface PluginState {
		"cc-uma-memory": {
			/** A /uma output's first line (what the model reads) → the whole output, drawn in its row. */
			commandOutputs: Record<string, string>;
			/** Effective autoMemoryEnabled and the layer that decides it; null until computed at start. */
			memoryState: { enabled: boolean; source: "globální" | "projekt" | "lokální" | "výchozí" } | null;
			/** True once /uma claude-memory changed autoMemoryEnabled in this session (it takes effect next session). */
			memoryChanged: boolean;
			/** Persisted switches (`$.store`, across sessions): recall into prompts, the write approval mode, UMA rules in the system prompt, the immune interceptor's mode and the OpenRouter model of its recommendation ("" = default). Written only by uma-command. */
			settings: Shaped<{ recall: boolean; writeGate: "ask" | "off"; append: boolean; immune: "off" | "warn" | "ask" | "auto"; immuneModel: string }>;
			/** Recall's memory of this session: ids already inserted (anti-echo) and whether the last run failed (log once per series). */
			recallSession: { session: string; ids: string[]; failing: boolean };
			/** The debt ledger as the last `uma debt check` saw it: open blocking debts (the label under the prompt), reminders spent in this run, whether the next main turn is our own continuation, whether the last check failed. Written only by debt. */
			debtState: { blocking: number; reminders: number; continuing: boolean; failing: boolean };
			/** The rules section for this session's system prompt, fetched once per session (null = not fetched yet, "" = no rules) and whether the last fetch failed (log once per series). */
			rulesSession: { session: string; text: string | null; failing: boolean };
		};
	}
}
