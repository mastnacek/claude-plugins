// consent.ts — the first time a file is masked, the user sees what `anon scan`
// found (kinds and counts, never values) and chooses to allow it.
// The question is a colored pane (drawn by the findings-band slice); where no
// surface can show one (headless, mobile only) it is the plain ask dialog.
// Allowed paths live in this module's memory: a reload asks again.

import type { EngineInterface } from "claude-code";
import { atom, update } from "claude-code";
import { scan } from "./anon";
import { groupByFile, plainList } from "./findings";
import type { FileFindings, ToolCard } from "../../types";

type $ = EngineInterface;

/** The id of the consent pane; the slice that draws it hooks `ui.render` for it. */
export const CONSENT_PANE = "anon-consent";

const ALLOW = "Povolit (agent uvidí zamaskovanou verzi)";
const DENY = "Zamítnout";
const allowed = new Set<string>();
// Declared in each file that touches it: the engine's scan reads the ref where it is used.
const findings = atom({ plugin: "cc-data-anonymizer", key: "findings" } as const, null);
const cards = atom({ plugin: "cc-data-anonymizer", key: "cards" } as const, null);

/** A tool call's consent: its id (the card is drawn under that row) and the style shown in the status line. */
export type ToolRef = { toolUseId: string; style: string };

function setCard($: $, id: string, card: ToolCard) {
	return update($, cards, (all) => ({ ...all, [id]: card }));
}

// The open pane's answer; the pane's buttons and its close settle it.
let pending: ((allow: boolean) => void) | undefined;
// One question at a time: the pane has one id.
let queue: Promise<unknown> = Promise.resolve();

/** Answers the open consent pane (no-op when none waits). Closing the pane answers false. */
export function settleConsent(allow: boolean): void {
	const resolve = pending;
	pending = undefined;
	resolve?.(allow);
}

const normalize = (path: string) => path.replace(/\\/g, "/").replace(/^[A-Za-z]:/, (drive) => drive.toLowerCase());

/** The pane's answer, or undefined when no surface can show it (the caller asks in a dialog). */
async function askInPane($: $, groups: FileFindings[]): Promise<boolean | undefined> {
	const surfaces = await $.session.surfaces().catch(() => []);
	if (!surfaces.some((surface) => surface !== "mobile")) return undefined;
	const answered = new Promise<boolean>((resolve) => {
		pending = resolve;
	});
	await update($, findings, () => groups);
	try {
		const opened = await $.ui
			.open({ id: CONSENT_PANE, title: "anon: citlivé hodnoty", focus: true, closeOnEscape: true, holdToasts: true })
			.catch(() => ({ isPlaced: false }));
		if (!opened.isPlaced) {
			pending = undefined;
			return undefined;
		}
		return await answered;
	} finally {
		pending = undefined;
		await update($, findings, () => null);
		await $.ui.close({ id: CONSENT_PANE }).catch(() => undefined);
	}
}

async function ask($: $, key: string, path: string, tool?: ToolRef): Promise<boolean> {
	if (allowed.has(key)) return true;
	const found = await scan($, path);
	if (!found.isFound) {
		allowed.add(key);
		return true;
	}
	const groups = groupByFile(found.findings, await $.session.cwd());
	// A tool call: the findings are a card under its row (any terminal width); the pane is a bonus where it is placed.
	if (tool !== undefined) {
		await setCard($, tool.toolUseId, { groups, decision: null });
		$.ui.invalidate("ui.render");
	}
	const paneAnswer = await askInPane($, groups);
	const question =
		tool === undefined
			? `Citlivé hodnoty v souborech:\n${plainList(groups)}\nAgent uvidí jen falešné náhrady. Povolit?`
			: "Citlivé hodnoty jsou vypsané výše. Povolit?";
	let isAllowed = paneAnswer;
	if (isAllowed === undefined) {
		// A tool call: the findings show above the ask dialog (the row's card is not drawn while this hook waits).
		if (tool !== undefined) await update($, findings, () => groups);
		try {
			isAllowed = (await $.ui.ask(question, [ALLOW, DENY]).catch(() => DENY)) === ALLOW;
		} finally {
			if (tool !== undefined) await update($, findings, () => null);
		}
	}
	if (tool !== undefined) {
		await setCard($, tool.toolUseId, { groups, decision: { isAllowed, style: tool.style } });
		$.ui.invalidate("ui.render");
	}
	if (isAllowed) allowed.add(key);
	return isAllowed;
}

/** True when the agent may get this file (masked). Throws AnonError when anon fails. */
export async function isFileAllowed($: $, path: string, tool?: ToolRef): Promise<boolean> {
	const key = normalize(path);
	if (allowed.has(key)) return true;
	if (!(await $.fs.stat(path).catch(() => undefined))) return true; // nothing to read, the tool reports it
	const turn = queue.then(() => ask($, key, path, tool));
	queue = turn.catch(() => undefined);
	return turn;
}
