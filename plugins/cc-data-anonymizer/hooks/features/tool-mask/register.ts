import type { Register } from "claude-code";
import { AnonError, convert } from "../../shared/anon";
import { isFileAllowed } from "../../shared/consent";
import { UNMASKED_FIELDS, mapFields } from "./fields";

const TOOLS = /^(Read|Grep|Bash|Edit|Write)$|^mcp__/;

const why = (error: unknown) => (error instanceof AnonError ? error.message : "anon failed unexpectedly");

export const registerToolMask = ((on) => {
	on("tool.call", { tool: TOOLS }, async ($, e, next) => {
		try {
			if (e.tool === "Read" && !(await isFileAllowed($, e.file_path))) {
				return { deny: `${e.file_path} was not allowed by the user.` };
			}

			const fields = UNMASKED_FIELDS[e.tool] ?? [];
			const input = await mapFields(e, fields, (picked) => convert($, "unmask", picked));

			const ran = await next(input);
			if (ran.deny !== undefined) return ran;
			if (ran.isError === true) return { deny: await convert($, "mask", ran.text ?? "") };
			return {
				result: await convert($, "mask", ran.result),
				...(ran.context ? { context: await convert($, "mask", ran.context) } : {}),
			};
		} catch (error) {
			return { deny: `${e.tool} blocked: ${why(error)}` };
		}
	});
}) satisfies (on: Parameters<Register>[0]) => void;
