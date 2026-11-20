// policy.ts — how a validation result is told to the model. Pure; no `$`.
// The rules themselves are in shared/manifest.ts (the /herdr-plugin command validates with the same ones).

import type { ManifestReport } from "../../shared/manifest";

export function answerText(r: ({ path: string } & ManifestReport) | { error: string }): string {
	if ("error" in r) return r.error;
	const lines =
		r.errors.length === 0
			? [`Manifest ${r.path} is valid for herdr.`]
			: [`Manifest ${r.path} failed validation with ${r.errors.length} error(s):`, ...r.errors.map((x) => `- ${x}`)];
	if (r.warnings.length > 0) lines.push(`Warnings:`, ...r.warnings.map((x) => `- ${x}`));
	return lines.join("\n");
}
