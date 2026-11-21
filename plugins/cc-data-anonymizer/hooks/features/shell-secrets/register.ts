import type { Register } from "claude-code";
import { isAsking, policyOf } from "../../shared/consent";
import { issuedKinds } from "../../shared/tags";

const SHELL = /^(Bash|PowerShell)$/;
const DEFAULT_KINDS = "password,secret,card,iban,national-id";

export const SHELL_SECRETS =
	"Hesla a tajemství se do příkazů nevracejí. Zapiš je do souboru přes Edit/Write, nebo příkaz spusť sám přes !.";

const ALLOW = "Vrátit do příkazu";
const DENY = "Zamítnout";

/** The kinds of tag that must not be restored in a shell command (option `shellSecretKinds`, comma separated). */
function kindsOf(options: Parameters<Register>[1]): Set<string> {
	const raw = typeof options.shellSecretKinds === "string" && options.shellSecretKinds.trim() ? options.shellSecretKinds : DEFAULT_KINDS;
	return new Set(raw.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean));
}

export const registerShellSecrets = ((on, options) => {
	const mode = options.shellSecrets === "ask" || options.shellSecrets === "allow" ? options.shellSecrets : "deny";
	const kinds = kindsOf(options);
	const policy = policyOf({ ...options, consent: "ask" });
	on("tool.call", { tool: SHELL }, async ($, e, next) => {
		if (mode === "allow") return next(e);
		const command = e.tool === "Bash" || e.tool === "PowerShell" ? e.command : "";
		const hit = [...(await issuedKinds($, [command]))].filter((k) => kinds.has(k));
		if (hit.length === 0) return next(e);
		if (mode === "ask" && (await isAsking($, policy))) {
			const answer = await $.ui
				.ask(`Příkaz obsahuje tajné hodnoty (${hit.join(", ")}). Vrátit je do příkazu?`, [ALLOW, DENY])
				.catch(() => DENY);
			if (answer === ALLOW) return next(e);
		}
		return { deny: SHELL_SECRETS };
	});
}) satisfies Register;
