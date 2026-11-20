import type { Register } from "claude-code";
import { AnonError, mask, styleOf } from "../../shared/anon";
import { isFileAllowed } from "../../shared/consent";

const FILE_TEXT = /^(file|edited_text_file|nested_memory)$/;

const why = (error: unknown) => (error instanceof AnonError ? error.message : "anon failed unexpectedly");

export const registerPromptMask = ((on, options) => {
	const style = styleOf(options);
	// A slash command's line is not rewritable here (the engine refuses it).
	on("prompt.submit", async ($, e, next) => {
		if (e.command) return next(e);
		try {
			return await next({ ...e, text: await mask($, e.text, style) });
		} catch (error) {
			return { drop: `Prompt not sent: ${why(error)}` };
		}
	});

	// First time a mentioned file is read, the user sees `anon scan` and allows it.
	on("prompt.mention", async ($, e, next) => {
		try {
			if (!(await isFileAllowed($, e.path))) return { deny: `${e.mention} was not allowed by the user.` };
		} catch (error) {
			return { deny: `${e.mention} not read: ${why(error)}` };
		}
		return next(e);
	});

	// The mentioned file's text reaches the model as an attachment: mask it there.
	on("prompt.attachment", { type: FILE_TEXT }, async ($, e, next) => {
		try {
			return await next({ ...e, text: await mask($, e.text, style) });
		} catch {
			return { text: null }; // fail closed: leave the attachment out
		}
	});
}) satisfies Register;
