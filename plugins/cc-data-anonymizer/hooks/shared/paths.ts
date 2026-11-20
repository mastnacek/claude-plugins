// paths.ts — pure: folders where agents and the harness keep their own state (session
// transcripts, todos, shell snapshots). Reading them is not reading the person's files:
// they are neither asked about nor masked (their masked prompts are already what they hold).

const AGENT_STATE =
	/[/\\]\.claude[/\\](?:projects|todos|shell-snapshots|session-env|statsig|file-history|ide)[/\\]|[/\\]\.(?:herdr|config[/\\]herdr)[/\\]/i;

export function isAgentState(path: string): boolean {
	return AGENT_STATE.test(path);
}
