// The plugin's type contract: every value it keeps in $.state, under its name.
// Add a key here before any atom reads or writes it; `claude plugin validate`
// holds the module to this list.

declare module "claude-code" {
	interface PluginState {
		"cc-uma-memory": {
			/** A /uma output's first line (what the model reads) → the whole output, drawn in its row. */
			commandOutputs: Record<string, string>;
			/** True once /uma claude-memory changed autoMemoryEnabled in this session (it takes effect next session). */
			memoryChanged: boolean;
		};
	}
}
