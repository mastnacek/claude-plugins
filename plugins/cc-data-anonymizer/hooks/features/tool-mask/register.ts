import type { Register } from "claude-code";
import { AnonError, LockedTagError, UnknownTagsError, convert, noteSink, styleOf } from "../../shared/anon";
import { isFileAllowed, policyOf } from "../../shared/consent";
import { recordToolNote } from "../../shared/notes";
import { isAgentState, isMedia } from "../../shared/paths";
import { foreignTag, tagLike, unknownTagMessage } from "../../shared/tags";
import { UNMASKED_FIELDS, mapFields, textsOf, writesRedacted } from "./fields";

const TOOLS = /^(Read|Grep|Bash|PowerShell|Edit|Write|NotebookEdit|NotebookRead)$|^mcp__/;

const MCP_TAG = "MCP nástroje značky neodmaskují; použij Edit/Write.";
const REDACTED = "Zápis obsahuje REDACTED (styl redact): původní hodnotu nejde obnovit. Přečti soubor znovu a nepřepisuj zamaskované místo.";

export const BINARY = "Binární soubor nejde zamaskovat; čtení zamítnuto.";

/** ANON_MASK_AGENT_STATE=1: transcripts and other agent state are masked like any file. */
const masksAgentState = async ($: { env: { get(name: string): Promise<string | undefined> } }): Promise<boolean> =>
	(await $.env.get("ANON_MASK_AGENT_STATE").catch(() => undefined))?.trim() === "1";

const why =(error: unknown) => (error instanceof AnonError ? error.message : "anon failed unexpectedly");

export const registerToolMask = ((on, options) => {
	const style = styleOf(options);
	const policy = policyOf(options);
	on("tool.call", { tool: TOOLS }, async ($, e, next) => {
		try {
			// The harness's own state (session transcripts…) is not the person's file: left as it is,
			// unless the session asked for it masked (ANON_MASK_AGENT_STATE=1: an observer reading
			// other sessions' transcripts).
			if (e.tool === "Read" && isAgentState(e.file_path) && !(await masksAgentState($))) return next(e);
			// PDFs and images are media-guard's: no text scan, no masking (a consented image passes as it is).
			if (e.tool === "Read" && isMedia(e.file_path)) return next(e);
			if (e.tool === "Read" && !(await isFileAllowed($, e.file_path, policy, { toolUseId: e.tool_use_id, style: style ?? "default" }))) {
				return { deny: `${e.file_path} was not allowed by the user.` };
			}

			// MCP tools get no unmask: a tag in their input would reach the server as it is.
			if (e.tool.startsWith("mcp__") && tagLike([JSON.stringify(e)]) !== undefined) return { deny: MCP_TAG };

			const fields = UNMASKED_FIELDS[e.tool] ?? [];
			// A tag this session was not issued is never sent to anon: it could pull another project's value.
			const foreign = await foreignTag($, textsOf(e, fields));
			if (foreign !== undefined) return { deny: unknownTagMessage(foreign) };
			// Strict unmask: a tag anon cannot restore (also a mangled or escaped one) throws UnknownTagsError.
			const input = await mapFields(e, fields, (picked) => convert($, "unmask", picked));
			if (writesRedacted(e.tool, input)) return { deny: REDACTED };

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
			if (error instanceof LockedTagError) return { deny: error.message };
			if (error instanceof UnknownTagsError) return { deny: unknownTagMessage(error.tags[0] ?? "") };
			// anon refuses a file that is not UTF-8 text: say so plainly instead of its raw error.
			if (e.tool === "Read" && error instanceof AnonError && /UTF-8/i.test(error.message)) return { deny: BINARY };
			return { deny: `${e.tool} blocked: ${why(error)}` };
		}
	});
}) satisfies Register;
