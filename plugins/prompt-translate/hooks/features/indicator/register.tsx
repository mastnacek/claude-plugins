// indicator — one tag at the end of the hint line under the prompt:
// [🇬🇧 49 Kč] (credit coloured by level), [🇬🇧 ⟳ překládám…] while a
// translation runs, [🇬🇧] on a Claude model, nothing when translation is off.
//
// Reads only $.state (config, credit, translating): every slice reports by
// writing those, none calls this one. No toasts: the frame and the answer
// switching language already say a translation is done.

import type { EngineInterface, On } from "claude-code";
import { atom, read } from "claude-code";
import { getConfig } from "../../shared/config";
import { refreshCredit } from "../../shared/credit";
import type { CreditInfo } from "../../shared/types";
import { buildBadge } from "./badge";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const creditAtom = atom({ plugin: "prompt-translate", key: "credit" } as const, {} as CreditInfo);
const translatingAtom = atom({ plugin: "prompt-translate", key: "translating" } as const, false);

export function registerIndicator(on: On): void {
	on("ui.render", { component: "PromptHint" }, async ($, e, next) => {
		const badge = buildBadge(await getConfig($), await read($, creditAtom), await read($, translatingAtom));
		if (!badge) return next(e);
		const line = await next(e);
		const { Box, Text } = $.ui.resolve(e);
		const color = badge.level === "critical" ? "error" : badge.level === "low" ? "warning" : "success";
		return (
			<Box flexDirection="row">
				{line}
				<Text>
					<Text dimColor>{"  ["}</Text>
					{badge.flag}
					{badge.translating ? (
						<Text dimColor>{" ⟳ překládám…"}</Text>
					) : badge.credit ? (
						<Text color={color}>{` ${badge.credit}`}</Text>
					) : null}
					<Text dimColor>{"]"}</Text>
				</Text>
			</Box>
		);
	});
}

/** Session start, run by the root after the configuration is loaded. */
export async function startIndicator($: EngineInterface): Promise<void> {
	void refreshCredit($);
}
