// command.ts — `/watch report [session|last|all|<id>]`: picks the ledger file(s), judges them, builds the output.

import type { EngineInterface } from "claude-code";
import { loadConfig } from "../../shared/config";
import { evaluate } from "../../shared/judge";
import { overview, scorecard, sentence } from "../../shared/output";
import type { Result } from "../../shared/output";
import { currentRole } from "../../shared/role";
import { listLogs, openLog, readEvents } from "../../shared/store";
import type { LogFile } from "../../shared/store";
import { readUmaContext } from "../../shared/uma";

type $ = EngineInterface;

export const USAGE = "Použití: /watch report [last | all | <id sezení>] · /watch rules";

async function one($: $, file: Pick<LogFile, "path" | "sid8" | "date" | "role">, workdir: string): Promise<Result> {
	const events = await readEvents($, file.path);
	const cfg = await loadConfig($, workdir);
	return scorecard(evaluate(events, cfg, file.role), { sid8: file.sid8, date: file.date }, await readUmaContext($, file.path));
}

export async function reportResult($: $, arg: string): Promise<Result> {
	const session = await $.session.id();
	const cwd = await $.session.cwd();
	const ref = await openLog($, session, await currentRole($), cwd);
	if (!ref) return sentence("chyba", "Watchdog · nenašel jsem domovskou složku, deník není kam číst.", "error");
	const files = await listLogs($, ref.dir);
	const want = arg.trim();

	if (want === "all") {
		const rows = [];
		for (const file of files) rows.push({ file, verdict: evaluate(await readEvents($, file.path), await loadConfig($, ref.workdir), file.role) });
		return overview(rows.reverse());
	}
	if (want === "last") {
		// The previous session: the newest ledger that is not this one (this one when there is no other).
		const file = files.filter((f) => f.path !== ref.path).at(-1) ?? files.at(-1);
		return file ? one($, file, ref.workdir) : sentence("report", "Watchdog · žádný deník sezení zatím nevznikl.", "warning");
	}
	if (want === "" || want === "session") {
		const file = files.find((f) => f.path === ref.path);
		return file ? one($, file, ref.workdir) : sentence("report", "Watchdog · deník tohoto sezení je zatím prázdný (první volání nástroje ho založí).", "warning");
	}
	const id = want.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
	const file = id.length >= 4 ? files.find((f) => f.sid8.toLowerCase().startsWith(id.slice(0, 8)) || id.startsWith(f.sid8.toLowerCase())) : undefined;
	return file ? one($, file, ref.workdir) : sentence("report", `Watchdog · sezení „${want}“ jsem nenašel. ${USAGE}`, "warning");
}
