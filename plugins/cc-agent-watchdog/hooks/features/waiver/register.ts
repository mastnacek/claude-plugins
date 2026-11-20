// waiver — the `watchdog_waiver` tool: the model asks for an exception to a rule BEFORE a deliberate violation.
//
//   start (root, session.start)   registers the tool
//   tool.call watchdog_waiver     checks the request, asks the person (`$.ui.ask`), writes a `waiver` line to the ledger,
//                                 answers the model. Instant-failure rules are refused without a dialog;
//                                 no one to ask (`-p`) = refused.
//
// An exception only excuses: the judge (shared/judge) takes a violation inside its window off the score,
// and `guard` lets a call through in block mode. Nothing here changes a call.

import type { EngineInterface, On } from "claude-code";
import { activeRules } from "../../shared/judge";
import { loadConfig } from "../../shared/config";
import { RULES } from "../../shared/rules";
import { currentRole } from "../../shared/role";
import { appendEvent, openLog } from "../../shared/store";
import type { LogRef } from "../../shared/store";
import { refusal, WAIVER_TOOL } from "../../shared/waivers";
import { ALLOW, DENY, HEADER, INPUT_SCHEMA, NO_UI, TOOL_DESCRIPTION, granted, optionOf, parseRequest, question, refused } from "./request";
import type { Request } from "./request";

type $ = EngineInterface;

const answer = (text: string) => ({ result: text, text }) as never;

/** Writes the decision down; a failed write is a quiet log line (the answer to the model stands). */
async function record($: $, ref: LogRef | undefined, req: Request, decision: "allow" | "deny", decidedBy: "dialog" | "policy"): Promise<void> {
	if (!ref) return;
	try {
		const role = await currentRole($);
		await appendEvent($, ref, {
			kind: "waiver",
			ts: await $.clock.now(),
			session: ref.session,
			role,
			cwd: await $.session.cwd(),
			rule: req.rule,
			reason: req.reason,
			scope: req.calls === undefined ? {} : { calls: req.calls },
			decision,
			decidedBy,
		});
	} catch (error) {
		$.ui.log(`výjimka: zápis do deníku selhal: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
	}
}

async function handle($: $, input: Record<string, unknown>) {
	const req = parseRequest(input);
	if ("error" in req) return answer(req.error);
	const rule = RULES.find((r) => r.id === req.rule);
	if (!rule) return answer(`Pravidlo ${req.rule} neexistuje. Zkus /watch rules (id v prvním sloupci).`);
	const role = await currentRole($);
	const session = await $.session.id();
	const cwd = await $.session.cwd();
	const ref = await openLog($, session, role, cwd);
	const cfg = await loadConfig($, ref?.workdir ?? cwd);
	if (!activeRules(role, cfg).some((r) => r.id === rule.id)) return answer(`Pravidlo ${rule.id} pro roli ${role} neplatí (vypnuté nebo se na roli nevztahuje); výjimku nepotřebuješ.`);
	const no = refusal(rule);
	if (no) {
		await record($, ref, req, "deny", "policy");
		return answer(no);
	}
	let picked: string;
	try {
		picked = optionOf(await $.ui.ask(question(rule, role, req), { options: [ALLOW, DENY], header: HEADER }), [ALLOW, DENY]);
	} catch {
		await record($, ref, req, "deny", "policy");
		return answer(refused(req, NO_UI));
	}
	if (picked === ALLOW) {
		await record($, ref, req, "allow", "dialog");
		return answer(granted(req));
	}
	await record($, ref, req, "deny", "dialog");
	return answer(refused(req, picked === DENY ? undefined : picked));
}

export function registerWaiver(on: On): void {
	// The full name carries the plugin's prefix (`mcp__<plugin>__watchdog_waiver`).
	on("tool.call", { tool: /(^|__)watchdog_waiver$/ }, async ($, e) => {
		try {
			return await handle($, e as unknown as Record<string, unknown>);
		} catch (error) {
			$.ui.log(`výjimka: žádost selhala: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
			return answer("Žádost o výjimku se nezpracovala; pravidlo dál platí.");
		}
	});
}

/** Session start, run by the root. */
export async function startWaiver($: EngineInterface): Promise<void> {
	await $.tool.register({ name: WAIVER_TOOL, description: TOOL_DESCRIPTION, inputSchema: INPUT_SCHEMA as unknown as Record<string, unknown>, isDeferred: false });
}
