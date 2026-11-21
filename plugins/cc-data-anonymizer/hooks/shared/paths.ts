// paths.ts — pure: folders where agents and the harness keep their own state (session
// transcripts, todos, shell snapshots). Reading them is not reading the person's files:
// they are neither asked about nor masked (their masked prompts are already what they hold).

const AGENT_STATE =
	/[/\\]\.claude[/\\](?:projects|todos|shell-snapshots|session-env|statsig|file-history|ide)[/\\]|[/\\]\.(?:herdr|config[/\\]herdr)[/\\]/i;

const PDF = /\.pdf$/i;
const IMAGE = /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i;

export const isPdf = (path: string): boolean => PDF.test(path);
export const isImage = (path: string): boolean => IMAGE.test(path);
/** PDFs and images are handled only by media-guard; the text paths (scan, mask) never see them. */
export const isMedia = (path: unknown): boolean => typeof path === "string" && (PDF.test(path) || IMAGE.test(path));

export function isAgentState(path: string): boolean {
	return AGENT_STATE.test(path);
}
