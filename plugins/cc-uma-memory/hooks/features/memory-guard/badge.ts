// badge.ts — what the tag under the prompt says, as plain text:
// [UMA] (Claude's memory off), [UMA ⚠ CC] (on), " ↻" before "]" once changed.

export function buildBadge(enabled: boolean, changed: boolean): string {
	return `[${enabled ? "UMA ⚠ CC" : "UMA"}${changed ? " ↻" : ""}]`;
}

/** Adds the badge after another plugin's tail (if any), separated by a space. */
export function addToTail(tail: string | undefined, badge: string): string {
	return tail ? `${tail} ${badge}` : badge;
}
