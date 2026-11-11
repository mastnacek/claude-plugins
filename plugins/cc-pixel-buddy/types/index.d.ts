// The plugin's type contract: every value it keeps in $.state, under its name.
// Add a key here before any atom reads or writes it; `claude plugin validate`
// holds the module to this list.

declare module "claude-code" {
	interface PluginState {
		"cc-pixel-buddy": {};
	}
}
