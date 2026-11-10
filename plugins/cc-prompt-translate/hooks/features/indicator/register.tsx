// indicator — one tag at the end of the hint line under the prompt:
// [🇬🇧 49 Kč] ([🇬🇧 ⚠ 12 Kč] when critical), [🇬🇧 ⟳ překládám…] while a
// translation runs, [🇬🇧] on a Claude model, nothing when translation is off.
// Goes into the hint's `tail` prop: dim text on the same line, no colours.
//
// Reads only $.state (config, credit, translating): every slice reports by
// writing those, none calls this one. No toasts: the frame and the answer
// switching language already say a translation is done.

import type { EngineInterface, On } from "claude-code";
import { atom, read } from "claude-code";
import { getConfig } from "../../shared/config";
import { refreshCredit } from "../../shared/credit";
import type { CreditInfo } from "../../shared/types";
import { addToTail, buildBadge } from "./badge";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const creditAtom = atom({ plugin: "cc-prompt-translate", key: "credit" } as const, {} as CreditInfo);
const translatingAtom = atom({ plugin: "cc-prompt-translate", key: "translating" } as const, false);

export function registerIndicator(on: On): void {
	on("ui.render", { component: "PromptHint" }, async ($, e, next) => {
		const badge = buildBadge(await getConfig($), await read($, creditAtom), await read($, translatingAtom));
		if (!badge) return next(e);
		return next({ ...e, props: { ...e.props, tail: addToTail(e.props.tail, badge) } });
	});
}

/** Session start, run by the root after the configuration is loaded. */
export async function startIndicator($: EngineInterface): Promise<void> {
	void refreshCredit($);
}
