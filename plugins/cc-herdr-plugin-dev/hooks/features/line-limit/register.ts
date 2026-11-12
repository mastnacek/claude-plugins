// line-limit — a source file in a herdr project stays at or below 400 lines (warning from 300).
//
//   tool.call {Edit, Write, MultiEdit}: runs the edit (`await next`), then counts the lines of the file
//       over the limit → `{ deny }` after the edit ran: the model reads the instruction to split the file
//       300–400                → the result gets a warning as a note (`context`)
//
// Only files in a herdr project (an ancestor holds herdr-plugin.toml) and only monitored source files;
// nothing else is touched. Fail-open: whatever goes wrong leaves the result as the edit made it.

import type { On } from "claude-code";
import { absolute, countLines, findHerdrRoot, isSourcePath } from "../../shared/project";
import { levelOf, notice } from "./limit";

export function registerLineLimit(on: On): void {
	on("tool.call", { tool: /^(Edit|Write|MultiEdit)$/ }, async ($, e, next) => {
		const done = await next(e);
		if (done.deny !== undefined || done.isError === true) return done;
		const raw = (e as unknown as { file_path?: unknown }).file_path;
		if (typeof raw !== "string" || raw === "") return done;
		const path = absolute(raw, await $.session.cwd());
		if (!isSourcePath(path) || (await findHerdrRoot($, path)) === undefined) return done;
		const lines = countLines(await $.fs.read(path));
		const level = levelOf(lines);
		const text = notice(level, path.slice(path.lastIndexOf("/") + 1), lines);
		if (text === undefined) return done;
		// A `deny` after the tool ran withholds its result and undoes nothing: the model reads "<tool> ran, and a plugin withheld its result: <text>".
		// (A rewritten `isError` result does not work: core maps `result` with the tool's own mapper and the model reads "File created".)
		if (level === "exceeded") return { deny: text };
		return { ...done, context: [...(done.context ?? []), text] };
	}).catch(($, e, next) => next(e)); // fail-open
}
