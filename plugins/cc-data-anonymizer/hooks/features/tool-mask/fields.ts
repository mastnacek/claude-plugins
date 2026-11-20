// Which input fields of a tool carry text the agent wrote with fake values.
export const UNMASKED_FIELDS: Readonly<Record<string, readonly string[]>> = {
	Bash: ["command"],
	PowerShell: ["command"],
	Edit: ["file_path", "old_string", "new_string"],
	Write: ["file_path", "content"],
	NotebookEdit: ["notebook_path", "new_source"],
};

// The text fields a tool writes into a file (the rest of the input only finds or names things).
const WRITTEN: Readonly<Record<string, string>> = {
	Edit: "new_string",
	Write: "content",
	NotebookEdit: "new_source",
	Bash: "command",
	PowerShell: "command",
};
const SHELL = /^(Bash|PowerShell)$/;

// REDACTED as a value: quoted, or right after = or : (a standalone REDACTED is what style `redact` leaves
// in place of a value that cannot be restored). Reading, searching for it or talking about it is no value.
const AS_VALUE = /(["'`])REDACTED\1|[=:]\s*REDACTED(?![\w:])/;
// A shell command that writes a file: a redirection to a file (not 2>&1, not /dev/null), tee,
// Set-Content, Add-Content, Out-File, sed -i, -OutFile.
const WRITES_FILE =
	/(?<![\d&=>-])>>?\s*(?![&>]|\/dev\/null\b)\S|\btee\b|\b(?:Set|Add)-Content\b|\bOut-File\b|\bsed\s+(?:-\w*i|--in-place)|-OutFile\b/;

/** The listed fields of `input` that hold text. */
export function textsOf(input: Record<string, unknown>, fields: readonly string[]): string[] {
	return fields.flatMap((field) => (typeof input[field] === "string" ? [input[field] as string] : []));
}

/**
 * True when the call writes REDACTED as a value into a file: Edit, Write and NotebookEdit when the new
 * text holds it as a value; a shell command only when it also writes a file.
 */
export function writesRedacted(tool: string, input: Record<string, unknown>): boolean {
	const field = WRITTEN[tool];
	const text = field === undefined ? "" : String(input[field] ?? "");
	if (!AS_VALUE.test(text)) return false;
	return !SHELL.test(tool) || WRITES_FILE.test(text);
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
