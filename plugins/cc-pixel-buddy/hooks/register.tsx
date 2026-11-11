// register.tsx — the composition root: it knows the slices, they don't know
// each other. Nothing else lives here.
//
// session.start may be hooked once per plugin, so it is hooked here and calls
// each slice's start. `on` / `$` go only to functions called by name: every
// slice is wired by an explicit call, never a loop over a list.

import type { Register } from "claude-code";

export const register: Register = (on) => {
	on("session.start", async (_$, e, next) => {
		// await startXxx($);  — one line per slice that needs a start
		return next(e);
	});

	// registerXxx(on);  — one line per slice
};
