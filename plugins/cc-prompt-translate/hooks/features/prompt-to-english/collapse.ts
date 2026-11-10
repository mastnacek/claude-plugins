/**
 * Display only: shorten pasted blocks in the original/English frame. The model
 * gets the text unchanged; a pasted table or log would otherwise fill the
 * transcript.
 */

/** Lines of a pasted block that stay visible. */
export const VISIBLE_LINES = 3;

const PASTED_BLOCK = /(<pasted_content\b[^>]*>)([\s\S]*?)(<\/pasted_content\b[^>]*>)/gi;

/** Keep the first lines of every `<pasted_content>` block, count the rest. */
export function collapsePastedBlocks(text: string, visible = VISIBLE_LINES): string {
	return text.replace(PASTED_BLOCK, (match, open: string, body: string, close: string) => {
		const lines = body.replace(/^\n/, "").replace(/\n$/, "").split("\n");
		if (lines.length <= visible) return match;
		const rest = lines.length - visible;
		return `${open}\n${lines.slice(0, visible).join("\n")}\n… (${rest} ${rest === 1 ? "další řádek" : rest < 5 ? "další řádky" : "dalších řádků"})\n${close}`;
	});
}
