import type { Register } from "claude-code";
import { atom, update } from "claude-code";
import { AnonError, convert, styleOf } from "../../shared/anon";
import { isFileAllowed } from "../../shared/consent";
import { UNMASKED_FIELDS, hasRedacted, mapFields } from "./fields";

// Declared in each file that touches it: the engine's scan reads the ref where it is used.
const warning = atom({ plugin: "cc-data-anonymizer", key: "redactWarning" } as const, null);

const TOOLS = /^(Read|Grep|Bash|Edit|Write)$|^mcp__/;

const why = (error: unknown) => (error instanceof AnonError ? error.message : "anon failed unexpectedly");

export const registerToolMask = ((on, options) => {
	const style = styleOf(options);
	on("tool.call", { tool: TOOLS }, async ($, e, next) => {
		try {
			if (e.tool === "Read" && !(await isFileAllowed($, e.file_path))) {
				return { deny: `${e.file_path} was not allowed by the user.` };
			}

			const fields = UNMASKED_FIELDS[e.tool] ?? [];
			const input = await mapFields(e, fields, (picked) => convert($, "unmask", picked));
			if (hasRedacted(input, fields)) {
				await update($, warning, () => `${e.tool}: the input holds REDACTED values; they cannot be restored (style redact).`);
			}

			const ran = await next(input);
			if (ran.deny !== undefined) return ran;
			if (ran.isError === true) return { deny: await convert($, "mask", ran.text ?? "", style) };
			return {
				result: await convert($, "mask", ran.result, style),
				...(ran.context ? { context: await convert($, "mask", ran.context, style) } : {}),
			};
		} catch (error) {
			return { deny: `${e.tool} blocked: ${why(error)}` };
		}
	});
}) satisfies Register;
