// openrouter.ts — the deep module for one question to a model on OpenRouter.
// One call, complete(), hides where the key comes from, the request, the
// deadline and the reading of the answer. It never throws and never lets the key
// out: a failure is `{ ok: false, reason }` with a reason that names the kind of
// failure ("no-key", "timeout", "HTTP 429"), never the request, the header or the key.
//
// Key: OPENROUTER_API_KEY, else the key pi keeps in ~/.pi/agent/auth.json
// (`openrouter.access` of an `oauth` entry whose `expires` has not passed, or
// `openrouter.key`). The key lives only in a local variable of complete().

import type { EngineInterface } from "claude-code";

type $ = EngineInterface;

const URL = "https://openrouter.ai/api/v1/chat/completions";

export type Completion = { ok: true; text: string } | { ok: false; reason: string };

export type CompleteRequest = {
	model: string;
	system: string;
	user: string;
	/** Deadline for the whole answer; the call gives up (reason "timeout") after it. */
	timeoutMs: number;
	maxTokens?: number;
};

/** `expires` as pi writes it (ms since the epoch; a value below 1e11 reads as seconds). Missing = no deadline. */
function isExpired(expires: unknown, now: number): boolean {
	if (typeof expires !== "number" || !Number.isFinite(expires)) return false;
	return (expires < 1e11 ? expires * 1000 : expires) <= now;
}

/** The key out of pi's auth file content; undefined when there is none usable. */
export function keyFromAuthFile(text: string, now: number): string | undefined {
	let entry: Record<string, unknown> | undefined;
	try {
		const auth = JSON.parse(text) as Record<string, unknown>;
		const found = auth.openrouter;
		entry = typeof found === "object" && found !== null ? (found as Record<string, unknown>) : undefined;
	} catch {
		return undefined;
	}
	if (!entry) return undefined;
	if (entry.type === "oauth") {
		return typeof entry.access === "string" && entry.access && !isExpired(entry.expires, now) ? entry.access : undefined;
	}
	return typeof entry.key === "string" && entry.key ? entry.key : undefined;
}

async function resolveKey($: $): Promise<string | undefined> {
	const fromEnv = await $.env.get("OPENROUTER_API_KEY");
	if (fromEnv) return fromEnv;
	try {
		const home = await $.env.get("HOME");
		if (!home) return undefined;
		return keyFromAuthFile(await $.fs.read(`${home}/.pi/agent/auth.json`), Date.now());
	} catch {
		return undefined;
	}
}

/** The answer's text out of a chat-completions body; undefined when it has none. */
export function textOfCompletion(body: string): string | undefined {
	try {
		const data = JSON.parse(body) as { choices?: Array<{ message?: { content?: unknown } }> };
		const content = data.choices?.[0]?.message?.content;
		return typeof content === "string" && content.trim() ? content : undefined;
	} catch {
		return undefined;
	}
}

/** Asks `request.model` one question; the answer's text, or why there is none. */
export async function complete($: $, request: CompleteRequest): Promise<Completion> {
	try {
		const key = await resolveKey($);
		if (!key) return { ok: false, reason: "no-key" };
		const sent = $.http.fetch(URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
				"HTTP-Referer": "https://github.com/mastnacek/claude-plugins",
				"X-Title": "Claude Code UMA",
			},
			body: JSON.stringify({
				model: request.model,
				messages: [
					{ role: "system", content: request.system },
					{ role: "user", content: request.user },
				],
				max_tokens: request.maxTokens ?? 300,
				temperature: 0,
			}),
		});
		sent.catch(() => undefined); // a late failure after the deadline is nobody's business
		const timeout = $.clock.sleep(request.timeoutMs).then(() => "timeout" as const);
		const first = await Promise.race([sent, timeout]);
		if (first === "timeout") return { ok: false, reason: "timeout" };
		if (!first.ok) return { ok: false, reason: `HTTP ${first.status}` };
		const text = textOfCompletion(first.text);
		return text === undefined ? { ok: false, reason: "empty" } : { ok: true, text };
	} catch {
		return { ok: false, reason: "error" };
	}
}
