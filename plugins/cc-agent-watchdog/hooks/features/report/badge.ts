// badge.ts — adds the tag to the prompt hint's tail without touching another plugin's tail.

/** Appends `badge` after another plugin's tail (if any), separated by a space. */
export function addToTail(tail: string | undefined, badge: string): string {
	return tail ? `${tail} ${badge}` : badge;
}
