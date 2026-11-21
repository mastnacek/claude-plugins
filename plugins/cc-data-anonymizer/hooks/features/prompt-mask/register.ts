import type { Register } from "claude-code";
import { AnonError, mask, noteSink, styleOf } from "../../shared/anon";
import { isFileAllowed, policyOf } from "../../shared/consent";
import { recordPromptImages, recordPromptNote } from "../../shared/notes";

const FILE_TEXT = /^(file|edited_text_file|nested_memory)$/;

const why = (error: unknown) => (error instanceof AnonError ? error.message : "anon failed unexpectedly");

export const registerPromptMask = ((on, options) => {
	const style = styleOf(options);
	const policy = policyOf(options);
	// The submitted text of this turn: the user message row the @ files' note is drawn under.
	let submitted: string | undefined;
	// A slash command's line is not rewritable here (the engine refuses it).
	on("prompt.submit", async ($, e, next) => {
		if (e.command) return next(e);
		try {
			const sink = noteSink(policy.reveal);
			const text = await mask($, e.text, style, sink);
			submitted = text;
			await recordPromptNote($, text, sink.note);
			// Pasted images cannot be masked: the screen says so under the message.
			await recordPromptImages($, text, (e.attachments ?? []).filter((a) => a.type === "image").length);
			return await next({ ...e, text });
		} catch (error) {
			return { drop: `Prompt not sent: ${why(error)}` };
		}
	});

	// First time a mentioned file is read, the user sees `anon scan` and allows it.
	on("prompt.mention", async ($, e, next) => {
		try {
			if (!(await isFileAllowed($, e.path, policy))) return { deny: `${e.mention} was not allowed by the user.` };
		} catch (error) {
			return { deny: `${e.mention} not read: ${why(error)}` };
		}
		return next(e);
	});

	// The mentioned file's text reaches the model as an attachment: mask it there.
	on("prompt.attachment", { type: FILE_TEXT }, async ($, e, next) => {
		try {
			const sink = noteSink(policy.reveal);
			const text = await mask($, e.text, style, sink);
			if (submitted !== undefined) await recordPromptNote($, submitted, sink.note);
			return await next({ ...e, text });
		} catch {
			return { text: null }; // fail closed: leave the attachment out
		}
	});
}) satisfies Register;
