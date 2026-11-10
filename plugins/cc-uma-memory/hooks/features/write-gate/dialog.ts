// dialog.ts — pure texts of write-gate: what the dialog shows for a memory
// write or a shell command that would change memory, and how an answer is read.

export const WRITE_TOOL = "mcp__plugin_cc-uma-memory_uma__uma_write";
export const SUPERSEDE_TOOL = "mcp__plugin_cc-uma-memory_uma__uma_supersede";

export const ACCEPT = "Zapsat";
export const REJECT = "Zamítnout";

/** Longest body / command shown in the dialog. */
export const MAX_PREVIEW_CHARS = 600;

function clip(text: string, max: number): string {
	const t = text.trim();
	return t.length <= max ? t : `${t.slice(0, max)}… (+${t.length - max} znaků)`;
}

const line = (value: unknown, fallback: string): string => (typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim() : fallback);

/** The preview of an `uma_write` / `uma_supersede` call: type, title, scope, body (and the replaced id). */
export function previewOfWrite(tool: string, input: Record<string, unknown>): string {
	const supersede = tool === SUPERSEDE_TOOL;
	return [
		supersede ? `Nahradit fakt ${line(input.oldId, "(chybí ID)")}` : "Nový fakt",
		`Typ: ${line(input.type, supersede ? "(jako původní)" : "note")}`,
		`Titulek: ${line(input.title, "(bez titulku)")}`,
		`Scope: ${line(input.scope, supersede ? "(jako původní)" : "(výchozí)")}`,
		"",
		clip(typeof input.body === "string" ? input.body : "", MAX_PREVIEW_CHARS) || "(prázdné tělo)",
	].join("\n");
}

/** The preview of a shell command that would change memory. */
export function previewOfCommand(command: string): string {
	return `Příkaz v shellu mění paměť UMA mimo nástroje uma_write:\n\n${clip(command, MAX_PREVIEW_CHARS)}`;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

/** The answer's meaning. Anything but "Zapsat" is a no; text typed under "Other" goes to the model as the reason. */
export function verdictOf(answer: string): Verdict {
	if (answer === ACCEPT) return { ok: true };
	if (answer === REJECT) return { ok: false, reason: "Uživatel zápis do paměti UMA zamítl. Nezapisuj to znovu bez nového pokynu." };
	return { ok: false, reason: `Uživatel zápis do paměti UMA zamítl a napsal: ${clip(answer, 300)}` };
}

export const NO_UI_REASON = "Zápis do paměti UMA vyžaduje souhlas uživatele, ale nelze se zeptat (bez dialogu). Nezapsáno.";

export const FILE_DENY_REASON = "Soubory paměti UMA se nemění přímo. Paměť se mění jen nástrojem uma_write (nebo uma_supersede), aby zápis mohl uživatel schválit.";
