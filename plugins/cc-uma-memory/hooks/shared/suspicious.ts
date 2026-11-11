// suspicious.ts — is a proposed fact an attempt to poison memory? Pure functions, no engine.
// A fact outlives the session and is read by every later one, so a fact that weakens the
// protections (gates, approvals, tests, hooks), injects instructions or carries a secret is
// the most valuable thing an attacker can get into memory. The check only WARNS: the person
// still decides (the dialog's first choice becomes "Reject", approving stays possible).
//
// Why own patterns and not `uma secrets scan` (checked with `--json`): the scan knows English
// injection phrases only and no weakening of protections, misses `Bearer …` tokens and
// "disregard prior rules", and a process call inside the 10 s `tool.call` budget buys nothing
// for text this short. Heuristic by design; limits are in the slice's CLAUDE.md.

import { REJECT } from "./proposal";

export type FindingKind = "weakens-protection" | "prompt-injection" | "secret";

export type Finding = { kind: FindingKind; excerpt: string };

/** `\b` does not know Czech letters. */
const L = String.raw`\p{L}`;
const start = String.raw`(?<!${L})`;
const end = String.raw`(?!${L})`;

const PROTECTED_EN = String.raw`(?:gates?|hooks?|approvals?|confirmations?|reviews?|tests?|testing|ci|linters?|linting|lint|watchdog|immune|humility|guards?|safeguards?|checks?|permissions?)`;
const PROTECTED_CS = String.raw`(?:brán${L}*|hook${L}*|schválen${L}*|potvrzen${L}*|test${L}*|ci|lint${L}*|review|kontrol${L}*|watchdog${L}*|imun${L}*|pokor${L}*|oprávnění)`;

const WEAKEN: RegExp[] = [
	new RegExp(`${start}(?:disable|turn off|switch off|deactivate|skip|bypass|circumvent|ignore|override|remove)${end}[^.\\n;]{0,40}?${start}${PROTECTED_EN}${end}`, "iu"),
	new RegExp(`${start}(?:vypni|vypnout|vypínej|deaktivuj|přeskoč|přeskočit|obejdi|obejít|obcházej|ignoruj|ignorovat|zruš|zrušit|odstraň)${end}[^.\\n;]{0,40}?${start}${PROTECTED_CS}${end}`, "iu"),
	/--no-verify/i,
	/write-gate\s+off/i,
	new RegExp(`${start}auto-?approve`, "iu"),
	new RegExp(`${start}do(?:n't| not|n’t) ask${end}`, "iu"),
	new RegExp(`${start}without (?:asking|confirmation|approval|review|permission)${end}`, "iu"),
	new RegExp(`${start}no need to (?:ask|confirm)${end}`, "iu"),
	new RegExp(`${start}neptej se${end}`, "iu"),
	new RegExp(`${start}bez (?:potvrzení|souhlasu|schválení|ptaní|kontroly)${end}`, "iu"),
	new RegExp(`${start}automaticky schval${L}*`, "iu"),
];

const INJECTION: RegExp[] = [
	new RegExp(`${start}(?:ignore|disregard|forget|override)\\s+(?:all\\s+|any\\s+|the\\s+|your\\s+)*(?:previous|prior|above|earlier|preceding)\\s+(?:instructions?|rules?|prompts?|guidelines?)`, "iu"),
	new RegExp(`${start}(?:reveal|show|print|leak|repeat|output|replace|change|modify|update)\\s[^.\\n;]{0,20}?system prompt`, "iu"),
	/(?:new|updated) system prompt\s*:/i,
	/system prompt\s*:/i,
	new RegExp(`${start}you are now${end}`, "iu"),
	new RegExp(`${start}from now on,? you${end}`, "iu"),
	new RegExp(`${start}pretend (?:to be|you are|that you)`, "iu"),
	new RegExp(`${start}new instructions\\s*:`, "iu"),
	/jailbreak|\bDAN mode\b/i,
	new RegExp(`${start}(?:ignoruj|zapomeň|zapomeňte)\\s+(?:na\\s+)?(?:všechn${L}*\\s+)?(?:předchozí|dřívější|výše uvedené)\\s+(?:pokyny|instrukce|pravidla)`, "iu"),
	new RegExp(`${start}systémov${L}* prompt${L}*\\s*:`, "iu"),
	new RegExp(`${start}(?:od teď|nyní|teď) jsi${end}`, "iu"),
	new RegExp(`${start}předstírej`, "iu"),
];

const SECRET: RegExp[] = [
	/sk-[A-Za-z0-9_-]{16,}/,
	/gh[pousr]_[A-Za-z0-9]{20,}/,
	/github_pat_[A-Za-z0-9_]{20,}/,
	/-----BEGIN [A-Z ]*-----/,
	/Bearer\s+[A-Za-z0-9._~+/=-]{16,}/,
	/AKIA[0-9A-Z]{16}/,
	/xox[abprs]-[A-Za-z0-9-]{10,}/,
];

/** A sentence that describes how the protections work, not an order to drop them (heuristic). */
const DESCRIBES = new RegExp(
	`${start}(?:guards?|protects?|blocks?|denies|denied|prevents?|enforces?|disables only|hlídá|chrání|zamítá|brání|vynucuje|zakazuje)${end}`,
	"iu",
);
/** A negation right before the match turns an order to weaken into an order to keep. */
const NEGATED = new RegExp(`${start}(?:never|not|don't|don’t|do not|must not|should not|nikdy|nesmí|nesmíš|nevypínej|neobcházej|neignoruj|nepřeskakuj)${end}[^.\\n;]{0,15}$`, "iu");

const MAX_EXCERPT = 80;

const clip = (text: string): string => {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > MAX_EXCERPT ? `${flat.slice(0, MAX_EXCERPT)}…` : flat;
};

/** A secret is never repeated whole, not even in a warning. */
const masked = (text: string): string => `${text.slice(0, 6)}…`;

/** Splits into sentences (the unit the "describes" heuristic judges), keeping each one's offset. */
function sentences(text: string): Array<{ text: string; offset: number }> {
	const out: Array<{ text: string; offset: number }> = [];
	const cut = /[^.\n;]+/g;
	for (let m = cut.exec(text); m !== null; m = cut.exec(text)) out.push({ text: m[0], offset: m.index });
	return out;
}

/**
 * What in a proposed fact looks like an attempt to poison memory. Empty = nothing found.
 * Weakening of protections is judged per sentence: a sentence that only describes how a
 * protection works ("write-gate guards .uma/") and an order that keeps one ("never skip tests")
 * are left alone; injection phrases and secrets are reported wherever they stand.
 */
export function suspiciousFact(title: string, body: string, tags: readonly string[]): Finding[] {
	const text = [title, body, tags.join(", ")].join("\n");
	const found: Finding[] = [];
	const add = (finding: Finding): void => {
		if (!found.some((f) => f.kind === finding.kind && f.excerpt === finding.excerpt)) found.push(finding);
	};
	for (const re of SECRET) {
		const m = re.exec(text);
		if (m) add({ kind: "secret", excerpt: masked(m[0]) });
	}
	for (const re of INJECTION) {
		const m = re.exec(text);
		if (m) add({ kind: "prompt-injection", excerpt: clip(m[0]) });
	}
	for (const s of sentences(text)) {
		if (DESCRIBES.test(s.text)) continue;
		// Every match, not the first only: "skip the gate and disable tests" holds two orders.
		for (const re of WEAKEN) {
			for (const m of s.text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))) {
				if (!NEGATED.test(s.text.slice(0, m.index))) add({ kind: "weakens-protection", excerpt: clip(m[0]) });
			}
		}
	}
	return found;
}

const KIND_LABEL: Record<FindingKind, string> = {
	"weakens-protection": "oslabuje ochrany",
	"prompt-injection": "pokus o prompt injection",
	secret: "tajemství",
};

export const SUSPICIOUS_HEADER = "⚠️ Podezřelý obsah";

/** The dialog's question with the warning: header replaced by the warning, findings listed under it. No findings = unchanged. */
export function warnedQuestion(question: string, findings: readonly Finding[]): string {
	if (findings.length === 0) return question;
	const [head = "", ...rest] = question.split("\n");
	const lines = findings.map((f) => `  • ${KIND_LABEL[f.kind]}: „${f.excerpt}“`);
	return [`${SUSPICIOUS_HEADER} • ${head}`, ...lines, "  Schval jen vědomě — fakt ovlivní každé další sezení.", ...rest].join("\n");
}

/** The dialog's options with "Reject" first (the default) when something was found; otherwise as given. */
export function warnedOptions(options: string[], findings: readonly Finding[]): string[] {
	if (findings.length === 0) return options;
	return [REJECT, ...options.filter((o) => o !== REJECT)];
}
