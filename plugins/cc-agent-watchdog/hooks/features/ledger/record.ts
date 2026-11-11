// record.ts — turns a finished tool call into one ledger line. Pure.
// No file contents and no tool output are stored: paths, commands, urls, the exit
// code, a short error excerpt. Secrets are masked everywhere.

import { clip, secretsIn } from "../../shared/redact";
import type { Role, ToolEv, TurnEv } from "../../shared/types";

/** What the engine gave us about the call, loosened to plain data. */
export type CallInput = Record<string, unknown>;

/** What `next(e)` resolved to (the parts we read). */
export type CallResult = { deny?: string; isError?: boolean; text?: string };

const DENIED_RE = /doesn'?t want to proceed|permission to use .{0,60} has been denied|was blocked|blocked by|hook .{0,40}(blocked|denied)|user rejected|rejected by the user|^Blocked:|request was rejected|File access blocked/i;

const str = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 ? v : undefined);

export type Meta = { ts: number; durationMs: number; session: string; role: Role; cwd: string };

export function toEvent(tool: string, input: CallInput, result: CallResult, meta: Meta): ToolEv {
	const text = result.text ?? "";
	const denied = result.deny !== undefined || (result.isError === true && DENIED_RE.test(text.slice(0, 400)));
	const reason = result.deny ?? (denied ? text : undefined);
	const isError = result.deny !== undefined || result.isError === true;
	const path = str(input.file_path) ?? str(input.notebook_path) ?? str(input.path);
	const command = str(input.command);
	const url = str(input.url);
	const code = /^Exit code (-?\d+)/.exec(text)?.[1];
	const exitCode = code !== undefined ? Number(code) : tool === "Bash" && !isError ? 0 : undefined;
	const ev: ToolEv = { kind: "tool", ts: meta.ts, session: meta.session, role: meta.role, cwd: meta.cwd, tool, isError, denied, durationMs: meta.durationMs };
	if (path) ev.path = clip(path, 300);
	if (command) ev.command = clip(command, 600);
	if (url) ev.url = clip(url, 300);
	if (exitCode !== undefined) ev.exitCode = exitCode;
	if (reason) ev.deniedReason = clip(reason, 200);
	if (isError && text) ev.excerpt = clip(text.split("\n").find((l) => l.trim() && !/^Exit code/.test(l)) ?? text, 160);
	if (text && hasForeignSecret(text, input)) ev.secretOut = true;
	return ev;
}

/**
 * The output holds a secret the agent did not put in itself. A secret whose text (or its first
 * 8 characters, as a tool prints a cut preview) is in the call's own input is test data the agent
 * made up, not something the tool dug out.
 */
function hasForeignSecret(output: string, input: CallInput): boolean {
	const own = Object.values(input).filter((v): v is string => typeof v === "string").join("\n");
	return secretsIn(output).some((s) => !(own.includes(s) || (s.length >= 8 && own.includes(s.slice(0, 8)))));
}

export function toTurn(answer: string, meta: Pick<Meta, "ts" | "session" | "role" | "cwd">): TurnEv {
	return { kind: "turn", ts: meta.ts, session: meta.session, role: meta.role, cwd: meta.cwd, answer: clip(answer, 600) };
}
