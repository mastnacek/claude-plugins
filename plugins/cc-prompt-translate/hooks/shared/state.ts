// state.ts — helpers for the values kept in $.state. The atoms themselves are
// declared in each file that reads them: the validator's scan needs literals there.

/** Keys the transcript text is looked up by: trimmed, whitespace runs folded. */
export function textKey(text: string): string {
	return text.trim().replace(/\s+/g, " ");
}

/** Keep a record map from growing without bound over a long session. */
export function capRecord<T>(record: Record<string, T>, max = 200): Record<string, T> {
	const keys = Object.keys(record);
	if (keys.length <= max) return record;
	const next: Record<string, T> = {};
	for (const key of keys.slice(keys.length - max)) next[key] = record[key] as T;
	return next;
}
