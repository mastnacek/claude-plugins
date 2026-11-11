// redact.ts — takes secrets out of text before it is written to the ledger.

const SECRET_PATTERNS: RegExp[] = [
	/-----BEGIN [A-Z ]*(?:PRIVATE )?KEY-----[\s\S]*?(?:-----END [A-Z ]*KEY-----|$)/g,
	/\bsk-[A-Za-z0-9_-]{16,}/g,
	/\bgh[pousr]_[A-Za-z0-9]{20,}/g,
	/\bgithub_pat_[A-Za-z0-9_]{20,}/g,
	/\bAKIA[0-9A-Z]{16}\b/g,
	/\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
	/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
];

const MASK = "[REDACTED]";

/** `text` with secrets masked, and whether any was found. */
export function redact(text: string): { text: string; found: boolean } {
	let out = text;
	for (const re of SECRET_PATTERNS) out = out.replace(re, MASK);
	out = out.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, `$1${MASK}`);
	out = out.replace(/((?:password|passwd|token|secret|api[_-]?key|authorization)["']?\s*[=:]\s*["']?)[^\s"']{4,}/gi, `$1${MASK}`);
	out = out.replace(/(:\/\/[^\s/:@]+:)[^\s/@]+@/g, `$1${MASK}@`);
	return { text: out, found: out !== text };
}

/** Redacted and cut to `max` characters, one line. */
export function clip(text: string, max: number): string {
	const one = redact(text).text.replace(/\s+/g, " ").trim();
	return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}
