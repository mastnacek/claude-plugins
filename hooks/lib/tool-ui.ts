// tool-ui.ts — translating the AskUserQuestion dialog the model opens.
//
// The model writes the dialog in English; the person reads it. The tool input is
// rewritten before the dialog draws, so the questions, the option labels and their
// descriptions are in the target language. Headers (12-character chips) stay as
// written. All fields of one call go through one request as <<<n>>>-marked blocks,
// and a breach of the marker contract leaves the whole dialog untouched.

type Field = { get: () => string; set: (value: string) => void };

const marker = (index: number): string => `<<<${index}>>>`;
const MARKER_RE = /^<<<(\d+)>>>$/;

type Option = { label?: unknown; description?: unknown };
type Question = { question?: unknown; options?: unknown };

/** Deep-copies the questions and collects their translatable fields. */
export function collectQuestionFields(questions: readonly unknown[]): { copy: Question[]; fields: Field[] } {
	const copy = JSON.parse(JSON.stringify(questions)) as Question[];
	const fields: Field[] = [];
	const add = (holder: Record<string, unknown>, key: string) => {
		const value = holder[key];
		if (typeof value === "string" && value.trim()) {
			fields.push({ get: () => holder[key] as string, set: (v) => (holder[key] = v) });
		}
	};
	for (const q of copy) {
		if (!q || typeof q !== "object") continue;
		add(q as Record<string, unknown>, "question");
		if (Array.isArray(q.options)) {
			for (const opt of q.options as Option[]) {
				if (!opt || typeof opt !== "object") continue;
				add(opt as Record<string, unknown>, "label");
				add(opt as Record<string, unknown>, "description");
			}
		}
	}
	return { copy, fields };
}

export function formatBlocks(texts: readonly string[]): string {
	return texts.map((text, index) => `${marker(index)}\n${text}`).join("\n");
}

/** The translations in order, or null when the model broke the 0..count-1 marker contract. */
export function parseBlocks(output: string, count: number): string[] | null {
	const parsed: (string | undefined)[] = new Array(count).fill(undefined);
	let current: number | undefined;
	let buffer: string[] = [];
	const seen: number[] = [];
	const flush = (): void => {
		if (current !== undefined && current < count) {
			const text = buffer.join("\n").trim();
			if (text.length > 0) parsed[current] = text;
		}
		buffer = [];
	};
	for (const line of output.split(/\r?\n/)) {
		const match = MARKER_RE.exec(line.trim());
		if (match) {
			flush();
			current = Number(match[1]);
			seen.push(current);
			continue;
		}
		if (current !== undefined) buffer.push(line);
	}
	flush();
	const ordered = seen.filter((index, i) => seen[i - 1] !== index);
	if (ordered.length !== count) return null;
	for (let i = 0; i < count; i++) {
		if (ordered[i] !== i || parsed[i] === undefined) return null;
	}
	return parsed as string[];
}

/** Labels must stay distinct within a question, or the dialog cannot tell them apart. */
export function labelsDistinct(questions: readonly Question[]): boolean {
	return questions.every((q) => {
		if (!Array.isArray(q.options)) return true;
		const labels = (q.options as Option[]).map((o) => String(o.label ?? "").trim().toLowerCase());
		return new Set(labels).size === labels.length;
	});
}
