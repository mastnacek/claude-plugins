import type { Register } from "claude-code";
import { atom, update } from "claude-code";
import { AnonError, convert, noteSink, styleOf } from "../../shared/anon";
import { isFileAllowed, policyOf } from "../../shared/consent";
import { recordToolNote } from "../../shared/notes";
import { isAgentState } from "../../shared/paths";
import { UNMASKED_FIELDS, hasRedacted, mapFields } from "./fields";

// Declared in each file that touches it: the engine's scan reads the ref where it is used.
const warning = atom({ plugin: "cc-data-anonymizer", key: "redactWarning" } as const, null);

const TOOLS = /^(Read|Grep|Bash|Edit|Write)$|^mcp__/;

const why = (error: unknown) => (error instanceof AnonError ? error.message : "anon failed unexpectedly");

export const registerToolMask = ((on, options) => {
	const style = styleOf(options);
	const policy = policyOf(options);
	on("tool.call", { tool: TOOLS }, async ($, e, next) => {
		try {
			// The harness's own state (session transcripts…) is not the person's file: left as it is.
			if (e.tool === "Read" && isAgentState(e.file_path)) return next(e);
			if (e.tool === "Read" && !(await isFileAllowed($, e.file_path, policy, { toolUseId: e.tool_use_id, style: style ?? "default" }))) {
				return { deny: `${e.file_path} was not allowed by the user.` };
			}

			const fields = UNMASKED_FIELDS[e.tool] ?? [];
			const input = await mapFields(e, fields, (picked) => convert($, "unmask", picked));
			if (hasRedacted(input, fields)) {
				await update($, warning, () => `${e.tool}: the input holds REDACTED values; they cannot be restored (style redact).`);
			}

			const ran = await next(input);
			if (ran.deny !== undefined) return ran;
			// The note under the row (counts, kinds, values as `reveal` allows) goes to $.state, never to the result.
			const sink = noteSink(policy.reveal);
			const masked =
				ran.isError === true
					? { deny: await convert($, "mask", ran.text ?? "", style, sink) }
					: {
							result: await convert($, "mask", ran.result, style, sink),
							...(ran.context ? { context: await convert($, "mask", ran.context, style, sink) } : {}),
						};
			await recordToolNote($, e.tool_use_id, sink.note);
			return masked;
		} catch (error) {
			return { deny: `${e.tool} blocked: ${why(error)}` };
		}
	});
}) satisfies Register;
