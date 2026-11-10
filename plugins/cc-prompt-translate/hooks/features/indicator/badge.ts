// badge.ts — what the indicator says, as plain text: [🇬🇧 49 Kč],
// [🇬🇧 ⚠ 12 Kč] on a critical balance, [🇬🇧 ⟳ překládám…] while translating.

import type { CreditInfo, TranslateConfig } from "../../shared/types";

type Level = "ok" | "low" | "critical";

/** Null when prompt translation is off: nothing to show. */
export function buildBadge(config: TranslateConfig, credit: CreditInfo, translating: boolean): string | null {
	if (!config.enabled) return null;
	if (translating) return "[🇬🇧 ⟳ překládám…]";
	const { rate, remainingUsd } = credit;
	if (typeof remainingUsd !== "number") return "[🇬🇧]";
	const amount = typeof rate === "number" && rate > 0 ? `${(remainingUsd * rate).toFixed(0)} Kč` : `$${remainingUsd.toFixed(2)}`;
	return `[🇬🇧 ${balanceLevel(remainingUsd) === "critical" ? "⚠ " : ""}${amount}]`;
}

// pi's thresholds (USD): above $3 healthy, $1–3 time to refill, below $1 critical.
// Only "critical" shows (the ⚠ mark): the tail is dim text, no colours.
export function balanceLevel(remainingUsd: number): Level {
	if (remainingUsd <= 1) return "critical";
	if (remainingUsd <= 3) return "low";
	return "ok";
}

/** Adds the badge after another plugin's tail (if any), separated by a space. */
export function addToTail(tail: string | undefined, badge: string): string {
	return tail ? `${tail} ${badge}` : badge;
}
