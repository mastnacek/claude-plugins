// usage-log.ts — one JSON line per event into ~/.claude/prompt-translate/log/<day>.jsonl,
// only with `/prompt-translate log on`. It exists to evaluate the plugin after
// some days of use: quality (degraded, lost segments), speed, autodetection.
// The file stays on this machine. $.fs has no append and no delete: each write
// rewrites the day's file (small: one day), and old days are removed by hand.

import type { EngineInterface } from "claude-code";
import { getConfig } from "./config";
import { claudeConfigDir } from "./home";

export type LogEvent = { kind: string } & Record<string, unknown>;

// Writes are read-modify-write of one file; they run one after another.
let queue: Promise<void> = Promise.resolve();

/** Queues the event; never throws, and does nothing while logging is off. */
export function logEvent($: EngineInterface, event: LogEvent): Promise<void> {
	queue = queue.then(() => write($, event)).catch(() => {});
	return queue;
}

/** The start of a text, enough to judge a decision by eye. */
export function clip(text: string, max = 300): string {
	return text.length > max ? `${text.slice(0, max)}…` : text;
}

async function write($: EngineInterface, event: LogEvent): Promise<void> {
	if (!(await getConfig($)).log) return;
	const dir = await claudeConfigDir($);
	if (!dir) return;
	const now = new Date();
	const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	const path = `${dir}/prompt-translate/log/${day}.jsonl`;
	const before = (await $.fs.exists(path)) ? await $.fs.read(path) : "";
	await $.fs.write(path, `${before}${JSON.stringify({ ts: now.toISOString(), ...event })}\n`);
}
