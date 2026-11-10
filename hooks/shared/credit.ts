// credit.ts — USD→CZK rate (ČNB, ECB fallback), the OpenRouter key and balance,
// and the `credit` value in $.state that the indicator slice draws.
// Module-level caches start over on a reload; the day's rate is also kept in $.store.

import type { EngineInterface } from "claude-code";
import { atom, read, update } from "claude-code";
import { effectiveModel, getConfig, modelBackend } from "./config";
import type { BalanceInfo, CreditInfo } from "./types";

// Atoms are declared in every file that reads them (the validator's scan reads literals).
const creditAtom = atom({ plugin: "prompt-translate", key: "credit" } as const, {} as CreditInfo);

type $ = EngineInterface;

const CNB_DAILY_URL = "https://api.cnb.cz/cnbapi/exrates/daily?lang=EN";
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=CZK";
const OPENROUTER_CREDITS_URL = "https://openrouter.ai/api/v1/credits";
const BALANCE_TTL_MS = 5 * 60 * 1000;

let fxCache: { rate: number; date: string } | undefined;
let balanceCache: { info: BalanceInfo; ts: number } | undefined;

export function clearBalanceCache(): void {
	balanceCache = undefined;
}

/**
 * Re-reads the rate and, on an OpenRouter model, the balance (both cached), and
 * stores what the indicator shows. A Claude model has no credit to show.
 */
export async function refreshCredit($: $): Promise<void> {
	let next: CreditInfo = {};
	try {
		const config = await getConfig($);
		const openRouter = modelBackend(effectiveModel(config).setting) === "openrouter";
		const [rate, balance] = await Promise.all([getUsdToCzkRate($), openRouter ? getOpenRouterBalance($) : undefined]);
		next = { rate, remainingUsd: balance?.remaining };
	} catch {
		/* best-effort: keep what is shown */
		return;
	}
	const current = await read($, creditAtom);
	if (current.rate !== next.rate || current.remainingUsd !== next.remainingUsd) await update($, creditAtom, () => next);
}

// Show real amounts even when tiny: 0.000022 USD, 0.000468 Kč — never collapse to 0.000.
export function fmtSmallAmount(n: number): string {
	if (!Number.isFinite(n)) return "n/a";
	if (n === 0) return "0";
	const abs = Math.abs(n);
	const decimals = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
	return n.toFixed(decimals);
}

function today(): string {
	return new Date().toISOString().slice(0, 10);
}

export async function getUsdToCzkRate($: $): Promise<number | undefined> {
	const date = today();
	if (fxCache && fxCache.date === date) return fxCache.rate;
	const stored = (await $.store.get("fx")) as { rate?: number; date?: string } | undefined;
	if (stored && stored.date === date && typeof stored.rate === "number") {
		fxCache = { rate: stored.rate, date };
		return stored.rate;
	}
	let rate: number | undefined;
	try {
		const res = await $.http.fetch(CNB_DAILY_URL);
		if (res.ok) {
			const data = JSON.parse(res.text) as { rates?: Array<{ currencyCode: string; amount: number; rate: number }> };
			const usd = data.rates?.find((r) => r.currencyCode === "USD");
			if (usd) rate = usd.amount > 0 ? usd.rate / usd.amount : usd.rate;
		}
	} catch {
		/* ČNB failed: fall through */
	}
	if (rate === undefined) {
		try {
			const res = await $.http.fetch(FRANKFURTER_URL);
			if (res.ok) {
				const data = JSON.parse(res.text) as { rates?: { CZK?: number } };
				if (typeof data.rates?.CZK === "number" && data.rates.CZK > 0) rate = data.rates.CZK;
			}
		} catch {
			/* best-effort */
		}
	}
	if (rate === undefined) return fxCache?.rate ?? (typeof stored?.rate === "number" ? stored.rate : undefined);
	fxCache = { rate, date };
	await $.store.set("fx", fxCache);
	return rate;
}

/**
 * The OpenRouter key: OPENROUTER_API_KEY, else the key pi keeps in
 * ~/.pi/agent/auth.json (so a machine already set up for pi needs nothing more).
 */
export async function getOpenRouterApiKey($: $): Promise<string | undefined> {
	const envKey = await $.env.get("OPENROUTER_API_KEY");
	if (envKey) return envKey;
	const home = await $.env.get("HOME");
	if (!home) return undefined;
	try {
		const path = `${home}/.pi/agent/auth.json`;
		if (!(await $.fs.exists(path))) return undefined;
		const auth = JSON.parse(await $.fs.read(path)) as Record<string, unknown>;
		const entry = auth.openrouter as { access?: unknown; key?: unknown; apiKey?: unknown } | undefined;
		const key = entry?.access ?? entry?.key ?? entry?.apiKey;
		return typeof key === "string" && key ? key : undefined;
	} catch {
		return undefined;
	}
}

export async function getOpenRouterBalance($: $): Promise<BalanceInfo | undefined> {
	if (balanceCache && Date.now() - balanceCache.ts < BALANCE_TTL_MS) return balanceCache.info;
	const apiKey = await getOpenRouterApiKey($);
	if (!apiKey) return undefined;
	try {
		const res = await $.http.fetch(OPENROUTER_CREDITS_URL, {
			headers: { Authorization: `Bearer ${apiKey}` },
		});
		if (!res.ok) return balanceCache?.info;
		const data = JSON.parse(res.text) as { data?: { total_credits?: number; total_usage?: number } };
		const total = data.data?.total_credits ?? 0;
		const used = data.data?.total_usage ?? 0;
		const info: BalanceInfo = { remaining: total - used, total, used };
		balanceCache = { info, ts: Date.now() };
		return info;
	} catch {
		return balanceCache?.info;
	}
}
