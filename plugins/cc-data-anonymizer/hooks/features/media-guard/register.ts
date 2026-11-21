import type { Register } from "claude-code";
import { AnonError, convert, noteSink, styleOf } from "../../shared/anon";
import { isAsking, policyOf } from "../../shared/consent";
import { recordToolNote } from "../../shared/notes";
import { isAgentState } from "../../shared/paths";

const PDF = /\.pdf$/i;
const IMAGE = /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i;

export const NO_PDFTOTEXT =
	"PDF nejde zamaskovat: pdftotext není v PATH (nainstaluj poppler). Dokument se modelu nepředává.";
export const IMAGE_QUESTION = "Obrázek nejde zamaskovat. Poslat ho modelu?";
const ALLOW = "Poslat";
const DENY = "Neposílat";

const why = (error: unknown) => (error instanceof AnonError ? error.message : "anon failed unexpectedly");

/** "3" or "2-5" as pdftotext -f/-l flags; anything else reads the whole document. */
function pageFlags(pages: unknown): string[] {
	const m = typeof pages === "string" ? /^(\d+)(?:-(\d+))?$/.exec(pages.trim()) : null;
	return m ? ["-f", m[1] ?? "1", "-l", m[2] ?? m[1] ?? "1"] : [];
}

export const registerMediaGuard = ((on, options) => {
	const style = styleOf(options);
	const policy = policyOf(options);
	const allowedImages = new Set<string>();
	on("tool.call", { tool: "Read" }, async ($, e, next) => {
		const path = typeof e.file_path === "string" ? e.file_path : "";
		if (isAgentState(path)) return next(e);
		if (PDF.test(path)) {
			// The PDF itself never reaches the model: only its text, masked.
			let text: string;
			try {
				const run = await $.process.run(["pdftotext", "-layout", ...pageFlags(e.pages), path, "-"]).catch(() => undefined);
				if (run === undefined) return { deny: NO_PDFTOTEXT };
				if (run.exitCode !== 0 || run.isStdoutTruncated) return { deny: `PDF se nepodařilo převést na text (pdftotext, exit ${run.exitCode}).` };
				text = run.stdout;
			} catch {
				return { deny: NO_PDFTOTEXT };
			}
			try {
				const sink = noteSink(policy.reveal);
				const content = await convert($, "mask", text, style, sink);
				await recordToolNote($, e.tool_use_id, sink.note);
				const lines = content.split("\n").length;
				return { result: { type: "text", file: { filePath: path, content, numLines: lines, startLine: 1, totalLines: lines } } };
			} catch (error) {
				return { deny: `Read blocked: ${why(error)}` };
			}
		}
		if (IMAGE.test(path)) {
			const key = path.replace(/\\/g, "/").toLowerCase();
			if (allowedImages.has(key)) return next(e);
			if (await isAsking($, policy)) {
				const answer = await $.ui.ask(IMAGE_QUESTION, [ALLOW, DENY]).catch(() => DENY);
				if (answer === ALLOW) {
					allowedImages.add(key);
					return next(e);
				}
			}
			return { deny: `${IMAGE_QUESTION} Obrázek ${path} nebyl povolen.` };
		}
		return next(e);
	});
}) satisfies Register;
