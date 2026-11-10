// ask.ts — a yes/no question in the engine's own dialog.

import type { EngineInterface } from "claude-code";

/** True / false by the answer; undefined when dismissed or nobody can be asked. */
export async function askYesNo(
	$: EngineInterface,
	question: string,
	yes: string,
	no: string,
	header: string,
): Promise<boolean | undefined> {
	try {
		const answer = await $.ui.ask(question, { options: [yes, no], header });
		return answer === yes ? true : answer === no ? false : undefined;
	} catch {
		return undefined;
	}
}
