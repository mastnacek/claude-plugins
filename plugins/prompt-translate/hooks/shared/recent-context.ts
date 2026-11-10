// recent-context.ts — the last few exchanges of the conversation as plain text,
// attached to a prompt's translation so pronouns translate right.

import type { EngineInterface } from "claude-code";

/** The last `maxTurns` user/assistant exchanges, each snippet capped. */
export async function extractRecentContext($: EngineInterface, maxTurns = 2, maxChars = 600): Promise<string | undefined> {
	let messages: Awaited<ReturnType<EngineInterface["session"]["messages"]>>;
	try {
		messages = await $.session.messages();
	} catch {
		return undefined;
	}
	if (!Array.isArray(messages)) return undefined;
	const rows: Array<{ role: string; text: string }> = [];
	for (const m of messages as Array<{ role?: string; text?: string }>) {
		if (m.role !== "user" && m.role !== "assistant") continue;
		const clean = (m.text ?? "").trim().replace(/\s+/g, " ");
		if (clean) rows.push({ role: m.role, text: clean });
	}
	const recent = rows.slice(-maxTurns * 2);
	if (recent.length === 0) return undefined;
	return recent
		.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text.length > maxChars ? `${m.text.slice(0, maxChars)}…` : m.text}`)
		.join("\n");
}
