// badge.ts — what the tag under the prompt says, as plain text:
// [💾 🟢 UMA] (Claude's memory off), [💾 🟡 UMA ⚠ CC] (on), " ↻" before "]" once changed,
// " ⚖N" after it while N blocking debts are open, " 📝N" while N staged drafts wait for review.
// The light after 💾: 🔴 open blocking debts; else 🟡 Claude's memory on or drafts waiting; else 🟢.

/** The traffic light: red beats yellow beats green. */
export function light(enabled: boolean, debts: number, drafts: number): "🔴" | "🟡" | "🟢" {
	if (debts > 0) return "🔴";
	return enabled || drafts > 0 ? "🟡" : "🟢";
}

export function buildBadge(enabled: boolean, changed: boolean, debts = 0, drafts = 0): string {
	return `[💾 ${light(enabled, debts, drafts)} ${enabled ? "UMA ⚠ CC" : "UMA"}${changed ? " ↻" : ""}${debts > 0 ? ` ⚖${debts}` : ""}${drafts > 0 ? ` 📝${drafts}` : ""}]`;
}

/** Adds the badge after another plugin's tail (if any), separated by a space. */
export function addToTail(tail: string | undefined, badge: string): string {
	return tail ? `${tail} ${badge}` : badge;
}
