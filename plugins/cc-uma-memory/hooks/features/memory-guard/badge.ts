// badge.ts — what the tag under the prompt says, as plain text:
// [UMA] (Claude's memory off), [UMA ⚠ CC] (on), " ↻" before "]" once changed,
// " ⚖N" after it while N blocking debts are open.

export function buildBadge(enabled: boolean, changed: boolean, debts = 0): string {
	return `[${enabled ? "UMA ⚠ CC" : "UMA"}${changed ? " ↻" : ""}${debts > 0 ? ` ⚖${debts}` : ""}]`;
}

/** Adds the badge after another plugin's tail (if any), separated by a space. */
export function addToTail(tail: string | undefined, badge: string): string {
	return tail ? `${tail} ${badge}` : badge;
}
