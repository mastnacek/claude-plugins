// notes.ts — what masking did, kept in $.state for the screen only (the mask-note slice draws it).
// The model never sees $.state; a note holds counts, kinds and values cut by the `reveal` option.

import { atom, update } from "claude-code";
import type { EngineInterface } from "claude-code";
import type { MaskNote } from "../../types";
import { mergeNotes } from "./anon";

type $ = EngineInterface;

// Declared in each file that touches it: the engine's scan reads the ref where it is used.
const notes = atom({ plugin: "cc-data-anonymizer", key: "notes" } as const, null);
const promptNotes = atom({ plugin: "cc-data-anonymizer", key: "promptNotes" } as const, null);

const promptImages = atom({ plugin: "cc-data-anonymizer", key: "promptImages" } as const, null);

const KEEP = 200;

const newest = <T>(all: Record<string, T> | null): Record<string, T> =>
	Object.fromEntries(Object.entries(all ?? {}).slice(-KEEP + 1));

/** The row key of a user message: its submitted text (long prompts are shortened by a checksum). */
export function textKey(text: string): string {
	let hash = 5381;
	for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
	return `${text.length}:${hash >>> 0}`;
}

/** Adds this tool call's masking outcome to the note under its row. */
export function recordToolNote($: $, toolUseId: string, note: MaskNote | undefined) {
	if (note === undefined || (note.count === 0 && !note.isLocked)) return Promise.resolve();
	return update($, notes, (all) => ({ ...newest(all), [toolUseId]: mergeNotes(all?.[toolUseId], note) }));
}

/** Remembers that a prompt carried `count` pasted images (they are not masked); drawn under the message. */
export function recordPromptImages($: $, text: string, count: number) {
	if (count === 0) return Promise.resolve();
	return update($, promptImages, (all) => ({ ...newest(all), [textKey(text)]: count }));
}

/** Adds a masking outcome to the note under a user message (the prompt, then its @ files). */
export function recordPromptNote($: $, text: string, note: MaskNote | undefined) {
	if (note === undefined || (note.count === 0 && !note.isLocked)) return Promise.resolve();
	const key = textKey(text);
	return update($, promptNotes, (all) => ({ ...newest(all), [key]: mergeNotes(all?.[key], note) }));
}
