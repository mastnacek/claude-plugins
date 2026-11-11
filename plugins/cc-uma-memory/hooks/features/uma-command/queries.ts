// queries.ts — pure logic of the commands a person runs to look at the memory:
// `/uma search | list | read | timeline | doctor | reindex | export`. It builds
// the `uma` argv for each and turns the result into text; running the process
// is the caller's job.

export const README_URL = "https://github.com/mastnacek/claude-plugins/tree/main/plugins/cc-uma-memory#requirements";

export const QUERY_SUBCOMMANDS = ["search", "list", "read", "timeline", "doctor", "reindex", "export", "debt"] as const;
export type QuerySubcommand = (typeof QUERY_SUBCOMMANDS)[number];

export const isQuery = (sub: string | undefined): sub is QuerySubcommand => (QUERY_SUBCOMMANDS as readonly (string | undefined)[]).includes(sub);

export type Plan = { argv: string[]; /** Builds the text from a successful run's stdout: one line, or a summary line followed by the full listing. */ render: (stdout: string) => string } | { usage: string };

const listing = (what: string, stdout: string): string => {
	const body = stdout.trimEnd();
	if (!body) return `${what}: nic nenalezeno`;
	const n = body.split("\n").length;
	// The first line is all the model gets; the listing is for the person.
	return `${what}: ${n} řádků výpisu (ukázán uživateli)\n${body}`;
};

type Debt = { id?: unknown; sourceAction?: unknown; requiredAction?: unknown; blocking?: unknown; origin?: unknown; createdAt?: unknown; settledAt?: unknown };

/** `uma debt list --all --json` as text: a summary line for the model, then one line per debt for the person. */
function renderDebts(stdout: string): string {
	let debts: Debt[];
	try {
		const parsed: unknown = JSON.parse(stdout);
		if (!Array.isArray(parsed)) throw new Error("not a list");
		debts = parsed as Debt[];
	} catch {
		return "uma debt list vrátila nečitelnou odpověď";
	}
	if (debts.length === 0) return "Dluhy: žádné";
	const open = debts.filter((d) => !d.settledAt);
	const blocking = open.filter((d) => d.blocking).length;
	const lines = debts.map((d) => {
		const day = (v: unknown) => String(v).slice(0, 16).replace("T", " ");
		const state = d.settledAt ? `✔ vyrovnán ${day(d.settledAt)}` : d.blocking ? "BLOKUJÍCÍ" : "neblokující";
		return `${String(d.id)} [${state}] ${String(d.sourceAction)} → ${String(d.requiredAction)} (${String(d.origin)}, ${day(d.createdAt)})`;
	});
	return [`Dluhy: otevřených ${open.length} (blokujících ${blocking}), vyrovnaných ${debts.length - open.length} (výpis ukázán uživateli)`, ...lines].join("\n");
}

/** The flag value after `name`, or undefined when absent or missing. */
const valueOf = (args: readonly string[], name: string): string | undefined => {
	const i = args.indexOf(name);
	const v = i < 0 ? undefined : args[i + 1];
	return v === undefined || v.startsWith("--") ? undefined : v;
};

/** What `/uma <sub> <args…>` runs. Read-only subcommands never pass arguments through blindly: `doctor --confirm` would archive facts. */
export function planQuery(sub: QuerySubcommand, args: readonly string[]): Plan {
	switch (sub) {
		case "search": {
			const query = args.join(" ");
			if (!query) return { usage: "Použití: /uma search <dotaz>" };
			// `--` keeps a query like "--vectorize" a query, not a switch.
			return { argv: ["uma", "search", "--", query], render: (out) => listing(`Hledání „${query}“`, out) };
		}
		case "list": {
			const scope = args[0];
			if (args.length > 1 || scope?.startsWith("-")) return { usage: "Použití: /uma list [global|<projekt>]" };
			return { argv: scope ? ["uma", "list", "--scope", scope] : ["uma", "list"], render: (out) => listing(scope ? `Fakta (${scope})` : "Fakta", out) };
		}
		case "read": {
			const id = args[0];
			if (!id || args.length > 1 || id.startsWith("-")) return { usage: "Použití: /uma read <id>" };
			return { argv: ["uma", "read", "--", id], render: (out) => listing(`Fakt ${id}`, out) };
		}
		case "timeline": {
			const usage = "Použití: /uma timeline [--id <ULID>] [--all]";
			const id = valueOf(args, "--id");
			const rest = args.filter((a, i) => a !== "--all" && !(a === "--id") && !(id !== undefined && args[i - 1] === "--id"));
			if (rest.length > 0 || (args.includes("--id") && id === undefined)) return { usage };
			const argv = ["uma", "timeline", ...(id ? ["--id", id] : []), ...(args.includes("--all") ? ["--all"] : [])];
			return { argv, render: (out) => listing("Vývoj faktů", out) };
		}
		case "doctor":
			if (args.length > 0) return { usage: "Použití: /uma doctor" };
			return { argv: ["uma", "doctor"], render: (out) => listing("Zpráva uma doctor", out) };
		case "reindex":
			if (args.length > 0) return { usage: "Použití: /uma reindex" };
			return { argv: ["uma", "search", "", "--reindex"], render: () => "Index UMA byl přebudován." };
		case "debt": {
			const usage = "Použití: /uma debt [list|clear]";
			const action = args[0] ?? "list";
			if (args.length > 1 || (action !== "list" && action !== "clear")) return { usage };
			// clear is the person's action (the model's tool cannot do it): it deletes every debt of this working tree.
			if (action === "clear") return { argv: ["uma", "debt", "clear"], render: (out) => out.trim().split("\n")[0] || "Dluhy smazány." };
			return { argv: ["uma", "debt", "list", "--all", "--json"], render: renderDebts };
		}
		case "export": {
			const out = valueOf(args, "--out");
			if (!out || args.length !== 2) return { usage: "Použití: /uma export --out <složka>" };
			return { argv: ["uma", "export", "--okf", "--out", out], render: () => `Export OKF (jeden dokument na fakt) zapsán do ${out}.` };
		}
	}
}

/** Why `uma` could not be run (spawn failed, timeout) — with how to get it. */
export function missingBinary(reason: string): string {
	return `Příkaz uma se nepodařilo spustit (${reason}). Je binárka \`uma\` v PATH? Návod na instalaci: ${README_URL}`;
}

/** A run that ended with a non-zero exit code. */
export function failedRun(sub: string, exitCode: number, stderr: string): string {
	const line = stderr.split("\n").find((l) => l.trim())?.trim();
	return `uma ${sub} skončila kódem ${exitCode}${line ? `: ${line}` : ""}`;
}
