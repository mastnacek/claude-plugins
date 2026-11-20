// Which input fields of a tool carry text the agent wrote with fake values.
export const UNMASKED_FIELDS: Readonly<Record<string, readonly string[]>> = {
	Bash: ["command"],
	PowerShell: ["command"],
	Edit: ["file_path", "old_string", "new_string"],
	Write: ["file_path", "content"],
	NotebookEdit: ["notebook_path", "new_source"],
};

// A leftover standalone REDACTED (not a «REDACTED:kind:n» tag) was masked with `redact` and cannot be restored.
const LEFTOVER = /(?<![:\w])REDACTED(?![:\w])/;

/** The listed fields of `input` that hold text. */
export function textsOf(input: Record<string, unknown>, fields: readonly string[]): string[] {
	return fields.flatMap((field) => (typeof input[field] === "string" ? [input[field] as string] : []));
}

/** True when one of the listed text fields still holds a REDACTED value after unmask. */
export function hasRedacted(input: Record<string, unknown>, fields: readonly string[]): boolean {
	return fields.some((field) => !field.endsWith("_path") && LEFTOVER.test(String(input[field] ?? "")));
}

/** Copy of `input` with the listed fields replaced by `convert`'s results (one call). */
export async function mapFields<T extends Record<string, unknown>>(
	input: T,
	fields: readonly string[],
	convert: (picked: Record<string, string>) => Promise<Record<string, string>>,
): Promise<T> {
	const picked: Record<string, string> = {};
	for (const field of fields) {
		const value = input[field];
		if (typeof value === "string") picked[field] = value;
	}
	if (Object.keys(picked).length === 0) return input;
	return { ...input, ...(await convert(picked)) };
}
