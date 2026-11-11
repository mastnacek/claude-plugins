// dialog.ts — pure texts of write-gate: tool names, the shell-command dialog
// (pi's immune-dialog texts), the denial reasons and how an answer is read.
// The memory-write window itself is proposal.ts.

import { T } from "./proposal";

export const WRITE_TOOL = "mcp__plugin_cc-uma-memory_uma__uma_write";
export const SUPERSEDE_TOOL = "mcp__plugin_cc-uma-memory_uma__uma_supersede";

/** The shell dialog's yes, with pi's immune-dialog texts. */
export const ACCEPT_RUN = T.dialogProceed;
/** The shell dialog's no, with pi's immune-dialog texts. */
export const REJECT_RUN = T.dialogBlock;

const RULE = "─".repeat(32);

/** Longest body / command shown in the dialog. */
export const MAX_PREVIEW_CHARS = 600;

function clip(text: string, max: number): string {
	const t = text.trim();
	return t.length <= max ? t : `${t.slice(0, max)}… (+${t.length - max} znaků)`;
}

/** The question for a shell command that would change memory. */
export function previewOfCommand(command: string): string {
	return [
		T.immuneDialogTitle,
		"💻 Příkaz v shellu mění paměť UMA (mimo nástroj uma_write)",
		RULE,
		...clip(command, MAX_PREVIEW_CHARS).split("\n").map((l) => `   ${l}`),
		RULE,
		"Spustit příkaz?",
	].join("\n");
}

export type Verdict = { ok: true } | { ok: false; reason: string };

/** The answer's meaning. Only the accept label is a yes; text typed under "Other" goes to the model as the reason. */
export function verdictOf(answer: string, accept: string, reject: string): Verdict {
	if (answer === accept) return { ok: true };
	if (answer === reject) return { ok: false, reason: DENIED_REASON };
	return { ok: false, reason: `Uživatel zápis do paměti UMA zamítl a napsal: ${clip(answer, 300)}` };
}

/** What the model reads after a refused proposal. */
export const DENIED_REASON = "Uživatel návrh zápisu do paměti UMA zamítl. Nezapisuj to znovu bez nového pokynu.";

export const NO_UI_REASON = "Zápis do paměti UMA vyžaduje souhlas uživatele, ale nelze se zeptat (bez dialogu). Nezapsáno.";

export const FILE_DENY_REASON = "Soubory paměti UMA se nemění přímo. Paměť se mění jen nástrojem uma_write (nebo uma_supersede), aby zápis mohl uživatel schválit.";

/**
 * The option the answer names, as the plugin spelled it. The dialog hands a label
 * back without its emoji variation selector (U+FE0F: "✏️" comes back "✏"), so a
 * plain `===` misses it and the pick would read as free text. Free text stays as typed.
 */
export function optionOf(answer: string, options: readonly string[]): string {
	const bare = (t: string): string => t.replace(/\uFE0F/g, "").trim();
	return options.find((o) => bare(o) === bare(answer)) ?? answer;
}
