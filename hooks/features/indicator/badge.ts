// badge.ts — what the indicator says, as plain data: [🇬🇧 49 Kč].

import type { CreditInfo, TranslateConfig } from "../../shared/types";

export type Badge = {
	flag: string;
	/** The credit left, "49 Kč" (or "$2.13" without a rate); "" on a Claude model. */
	credit: string;
	level: "ok" | "low" | "critical";
	translating: boolean;
};

/** Null when prompt translation is off: nothing to show. */
export function buildBadge(config: TranslateConfig, credit: CreditInfo, translating: boolean): Badge | null {
	if (!config.enabled) return null;
	const { rate, remainingUsd } = credit;
	if (typeof remainingUsd !== "number") return { flag: "🇬🇧", credit: "", level: "ok", translating };
	const amount = typeof rate === "number" && rate > 0 ? `${(remainingUsd * rate).toFixed(0)} Kč` : `$${remainingUsd.toFixed(2)}`;
	return { flag: "🇬🇧", credit: amount, level: balanceLevel(remainingUsd), translating };
}

// pi's thresholds (USD): above $3 healthy, $1–3 time to refill, below $1 critical.
export function balanceLevel(remainingUsd: number): Badge["level"] {
	if (remainingUsd <= 1) return "critical";
	if (remainingUsd <= 3) return "low";
	return "ok";
}
