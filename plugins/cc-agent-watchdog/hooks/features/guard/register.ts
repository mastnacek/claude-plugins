// guard — `block` mode: refuses a call that breaks a rule in block mode, BEFORE it runs.
//
//   tool.call {Bash, Write, Edit, MultiEdit, NotebookEdit, Read}
//       judges the call's input (shared/block.ts); a rule in `block` mode with no open exception → { deny }
//
// Registered after the ledger, so the ledger sees (and records) the refusal. Fail-open: whatever goes
// wrong while judging lets the call through and leaves one `$.ui.log` line.

import type { EngineInterface, On } from "claude-code";
import { blockReason, breaches, callOf } from "../../shared/block";
import { loadConfig } from "../../shared/config";
import { currentRole } from "../../shared/role";
import { openLog, readEvents } from "../../shared/store";
import { openWaiver, refusal } from "../../shared/waivers";

type $ = EngineInterface;

/** The refusal for this call, or undefined to let it run. Throws on failure (the caller fails open). */
async function decide($: $, e: Record<string, unknown>): Promise<string | undefined> {
	const role = await currentRole($);
	if (role === "orchestrator") return undefined;
	const session = await $.session.id();
	const cwd = await $.session.cwd();
	const ref = await openLog($, session, role, cwd);
	const cfg = await loadConfig($, ref?.workdir ?? cwd);
	const found = breaches(callOf(e, { ts: await $.clock.now(), session, role, cwd }), role, cfg);
	if (found.length === 0) return undefined;
	// Only now is the ledger worth reading: is an exception open for the rule?
	const events = ref ? await readEvents($, ref.path) : [];
	for (const { rule, hit } of found) {
		if (refusal(rule) === undefined && openWaiver(events, rule.id)) continue;
		return blockReason(rule, hit);
	}
	return undefined;
}

export function registerGuard(on: On): void {
	on("tool.call", { tool: /^(Bash|Write|Edit|MultiEdit|NotebookEdit|Read)$/ }, async ($, e, next) => {
		let deny: string | undefined;
		try {
			deny = await decide($, e as unknown as Record<string, unknown>);
		} catch (error) {
			$.ui.log(`blokace: vyhodnocení selhalo, volání projde: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
		}
		return deny === undefined ? next(e) : { deny };
	}).catch(($, e, next) => next(e)); // fail-open
}
