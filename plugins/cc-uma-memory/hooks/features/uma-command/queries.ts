// queries.ts — pure logic of the commands a person runs to look at the memory:
// `/uma search | list | read | timeline | doctor | reindex | export`. It builds
// the `uma` argv for each (with `--json` where the engine has it) and turns the result
// into the model's line plus the data for the person (output.ts); running the process
// is the caller's job.

import { debtOutput, doctorOutput, listOutput, readOutput, searchOutput, sentence, timelineOutput } from "./output";
import type { Result } from "./output";
import type { Prose } from "./translate";

export const README_URL = "https://github.com/mastnacek/claude-plugins/tree/main/plugins/cc-uma-memory#requirements";

export const QUERY_SUBCOMMANDS = ["search", "list", "read", "timeline", "doctor", "reindex", "export", "debt"] as const;
export type QuerySubcommand = (typeof QUERY_SUBCOMMANDS)[number];

export const isQuery = (sub: string | undefined): sub is QuerySubcommand => (QUERY_SUBCOMMANDS as readonly (string | undefined)[]).includes(sub);

export type Plan = { argv: string[]; /** Builds the answer from a successful run's stdout: the model's line and the person's data. */ render: (stdout: string) => Result; /** What of the output is fact prose to show translated (none = nothing). */ prose?: Prose } | { usage: string };

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
			return { argv: ["uma", "search", "--json", "--", query], render: (out) => searchOutput(query, out), prose: "titles" };
		}
		case "list": {
			const scope = args[0];
			if (args.length > 1 || scope?.startsWith("-")) return { usage: "Použití: /uma list [global|<projekt>]" };
			return { argv: scope ? ["uma", "list", "--json", "--scope", scope] : ["uma", "list", "--json"], render: (out) => listOutput(scope ? `Fakta (${scope})` : "Fakta", out), prose: "titles" };
		}
		case "read": {
			const id = args[0];
			if (!id || args.length > 1 || id.startsWith("-")) return { usage: "Použití: /uma read <id>" };
			return { argv: ["uma", "read", "--json", "--", id], render: (out) => readOutput(id, out), prose: "titles-body" };
		}
		case "timeline": {
			const usage = "Použití: /uma timeline [--id <ULID>] [--all]";
			const id = valueOf(args, "--id");
			const rest = args.filter((a, i) => a !== "--all" && !(a === "--id") && !(id !== undefined && args[i - 1] === "--id"));
			if (rest.length > 0 || (args.includes("--id") && id === undefined)) return { usage };
			const argv = ["uma", "timeline", "--json", ...(id ? ["--id", id] : []), ...(args.includes("--all") ? ["--all"] : [])];
			return { argv, render: timelineOutput, prose: "titles" };
		}
		case "doctor":
			if (args.length > 0) return { usage: "Použití: /uma doctor" };
			return { argv: ["uma", "doctor", "--json"], render: doctorOutput };
		case "reindex":
			if (args.length > 0) return { usage: "Použití: /uma reindex" };
			return { argv: ["uma", "search", "", "--reindex"], render: () => sentence("reindex", "Index UMA byl přebudován.", "success") };
		case "debt": {
			const usage = "Použití: /uma debt [list|clear]";
			const action = args[0] ?? "list";
			if (args.length > 1 || (action !== "list" && action !== "clear")) return { usage };
			// clear is the person's action (the model's tool cannot do it): it deletes every debt of this working tree.
			if (action === "clear") return { argv: ["uma", "debt", "clear"], render: (out) => sentence("dluhy smazány", out.trim().split("\n")[0] || "Dluhy smazány.", "success") };
			return { argv: ["uma", "debt", "list", "--all", "--json"], render: debtOutput };
		}
		case "export": {
			const out = valueOf(args, "--out");
			if (!out || args.length !== 2) return { usage: "Použití: /uma export --out <složka>" };
			return { argv: ["uma", "export", "--okf", "--out", out], render: () => sentence("export", `Export OKF (jeden dokument na fakt) zapsán do ${out}.`, "success") };
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
