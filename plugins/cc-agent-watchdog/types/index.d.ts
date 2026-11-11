// The plugin's type contract: every value it keeps in $.state, under its name.
// Add a key here before any atom reads or writes it; `claude plugin validate`
// holds the module to this list.

declare module "claude-code" {
	/** One /watch output as data. */
	type WatchOutput = {
		/** After `👁 Watchdog · ` in the header. */
		title: string;
		/** The frame: normal = the plugin's colour, else error / warning / success. */
		tone: "normal" | "error" | "warning" | "success";
		lines: Array<{ text: string; tone?: "error" | "warning" | "success" | "dim" }>;
	};

	interface PluginState {
		"cc-agent-watchdog": {
			/**
			 * The score of this session as `rules` last judged it (at the end of a turn); null until then.
			 * `count` is the number of violations. Written only by rules, read by report (the tag under the prompt).
			 */
			verdict: { score: number; instant: boolean; count: number } | null;
			/**
			 * A /watch output's first line (what the model reads) → the whole output as data, which `report` draws
			 * in its row. Written by report and rules; at most 20 entries.
			 */
			commandOutputs: Shaped<Record<string, WatchOutput>>;
		};
	}
}
