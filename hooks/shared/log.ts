// log.ts — the mod's two log levels. A debug line goes to the transcript only
// with `/prompt-translate debug on`; a warning always does.

import type { EngineInterface } from "claude-code";
import { getConfig } from "./config";

export async function debug($: EngineInterface, message: string): Promise<void> {
	const config = await getConfig($);
	$.ui.log(`[prompt-translate] ${message}`, config.debug ? undefined : { to: "debug" });
}

export function warn($: EngineInterface, message: string): void {
	$.ui.log(`prompt-translate: ${message}`);
}
