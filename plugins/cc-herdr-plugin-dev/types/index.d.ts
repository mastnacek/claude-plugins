// The plugin's type contract: every value it keeps in $.state, under its name.
// Add a key here before any atom reads or writes it; `claude plugin validate`
// holds the module to this list.

declare module "claude-code" {
	/** One /herdr-plugin output as data. */
	type HerdrOutput = {
		/** After `🧩 Herdr · ` in the header. */
		title: string;
		/** The frame: normal = the plugin's colour, else error / warning / success. */
		tone: "normal" | "error" | "warning" | "success";
		lines: Array<{ text: string; tone?: "error" | "warning" | "success" | "dim" }>;
	};

	interface PluginState {
		"cc-herdr-plugin-dev": {
			/**
			 * True once this session read the herdr docs (the skill's files, docs/herdr, or ran the skill).
			 * Written by docs-gate; unset in a new session (the gate is closed).
			 */
			docsRead: boolean;
			/**
			 * A /herdr-plugin output's first line (what the model reads) → the whole output as data, which
			 * `command` draws in its row. Written and read by command; at most 20 entries.
			 */
			commandOutputs: Shaped<Record<string, HerdrOutput>>;
		};
	}
}
