// register.tsx — the composition root: it knows the slices, they don't know
// each other. Nothing else lives here.
//
// session.start may be hooked once per plugin, so it is hooked here and calls
// each slice's start. `on` / `$` go only to functions called by name: every
// slice is wired by an explicit call, never a loop over a list.

import type { Register } from "claude-code";
import { registerDrift, startDrift } from "./features/drift/register";
import { registerGuard } from "./features/guard/register";
import { registerInvariants } from "./features/invariants/register";
import { registerStatus, startStatus } from "./features/status/register";

export const register: Register = (on) => {
	on("session.start", async ($, e, next) => {
		await startDrift($);
		await startStatus($);
		return next(e);
	});

	registerInvariants(on);
	registerGuard(on);
	registerDrift(on);
	registerStatus(on);
};
