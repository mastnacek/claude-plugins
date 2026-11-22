import type { EngineInterface, Register } from "claude-code";
import { atom, read } from "claude-code";
import { LOCKED_NOTE } from "../../shared/anon";
import { kindColor } from "../../shared/findings";
import { textKey } from "../../shared/notes";
import type { MaskNote } from "../../../types";

// Declared in each file that touches it: the engine's scan reads the ref where it is used.
const notes = atom({ plugin: "cc-data-anonymizer", key: "notes" } as const, null);
const promptNotes = atom({ plugin: "cc-data-anonymizer", key: "promptNotes" } as const, null);
const promptImages = atom({ plugin: "cc-data-anonymizer", key: "promptImages" } as const, null);

type Els = ReturnType<EngineInterface["ui"]["resolve"]>;

const MAX_VALUES = 6;

const kindList = (note: MaskNote) =>
	Object.entries(note.kinds)
		.map(([kind, n]) => (n > 1 ? `${kind} ×${n}` : kind))
		.join(", ");

// The small frame: one summary line, then the values the person may see (cut by the reveal option).
// Drawn from $.state only: nothing here is part of a tool result or the transcript.
function frame(note: MaskNote, { Box, Text }: Els) {
	const shownValues = note.values.slice(0, MAX_VALUES);
	const hidden = note.values.length - shownValues.length;
	return (
		<Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
			{note.count > 0 && (
				<Text color="warning">
					🔒 anon: zamaskováno {note.count} hodnot ({kindList(note)}), styl {note.style || "výchozí"}
				</Text>
			)}
			{note.isLocked === true && <Text color="error">⚠ {LOCKED_NOTE} Hodnoty jen z trezoru se nemaskují.</Text>}
			{shownValues.map((v, i) => (
				<Text key={String(i)}>
					{"  "}
					<Text color={kindColor(v.kind)}>{v.kind}</Text>
					{"  "}
					<Text bold>{v.text}</Text>
				</Text>
			))}
			{hidden > 0 && <Text dimColor>… a {hidden} dalších</Text>}
		</Box>
	);
}

// After every masking operation a frame says what was masked: under the tool's row (also for a
// file that was allowed earlier or never asked about), and under the user's message for the
// prompt and its @ files.
export const registerMaskNote = ((on) => {
	on("ui.render", { component: "ToolUse" }, async ($, e, next) => {
		const row = await next(e);
		const note = (await read($, notes))?.[e.props.tool_use_id];
		if (note === undefined) return row;
		const els = $.ui.resolve(e);
		return (
			<els.Box flexDirection="column">
				{row}
				{frame(note, els)}
			</els.Box>
		);
	});

	on("ui.render", { component: "UserMessage" }, async ($, e, next) => {
		const row = await next(e);
		const key = textKey(e.props.text);
		const note = (await read($, promptNotes))?.[key];
		const images = (await read($, promptImages))?.[key];
		if (note === undefined && images === undefined) return row;
		const els = $.ui.resolve(e);
		return (
			<els.Box flexDirection="column">
				{row}
				{images !== undefined && <els.Text color="warning">⚠ anon: obrázek v promptu nejde zamaskovat, model ho uvidí celý.</els.Text>}
				{note !== undefined && frame(note, els)}
			</els.Box>
		);
	});
}) satisfies Register;
