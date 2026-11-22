// skip.ts — `skipPatterns`: regex sources from the configuration. A text whose
// trimmed form matches any of them is never detected and never translated.
// An invalid source is ignored, with a debug line.

import type { EngineInterface } from "claude-code";
import { debug } from "./log";

/** The pattern that matches the trimmed text, or undefined. */
export async function matchingSkipPattern($: EngineInterface, text: string, patterns: readonly string[]): Promise<string | undefined> {
	const trimmed = text.trim();
	for (const source of patterns) {
		let re: RegExp;
		try {
			re = new RegExp(source);
		} catch {
			await debug($, `skipPatterns: ignoring invalid regex ${JSON.stringify(source)}`);
			continue;
		}
		if (re.test(trimmed)) return source;
	}
	return undefined;
}
