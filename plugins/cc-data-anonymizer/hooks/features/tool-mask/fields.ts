// Which input fields of a tool carry text the agent wrote with fake values.
export const UNMASKED_FIELDS: Readonly<Record<string, readonly string[]>> = {
	Bash: ["command"],
	Edit: ["file_path", "old_string", "new_string"],
	Write: ["file_path", "content"],
};

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
