// limit.ts — the per-file line limit and the notices for it. Pure; no `$`.

import { MAX_FILE_LINES, WARN_FILE_LINES } from "../../shared/project";

export type Level = "ok" | "warn" | "exceeded";

export function levelOf(lines: number): Level {
	return lines > MAX_FILE_LINES ? "exceeded" : lines >= WARN_FILE_LINES ? "warn" : "ok";
}

export function notice(level: Level, file: string, lines: number): string | undefined {
	if (level === "warn") {
		return [
			`ℹ️ [Line length advisory] '${file}' má ${lines} řádků (od ${WARN_FILE_LINES} varování, limit ${MAX_FILE_LINES}).`,
			"Brzy rozděl soubor na soudržné moduly; nad limitem se úprava zamítne.",
		].join("\n");
	}
	if (level === "exceeded") {
		return [
			`🚨 [Line limit exceeded: ${lines} řádků, limit ${MAX_FILE_LINES}] '${file}'`,
			"Zdrojový soubor je příliš dlouhý a musí se rozdělit.",
			"- Stejný soubor nezkoušej znovu beze změny, zamítne se znovu.",
			"- Najdi soudržné části (třídy, skupiny funkcí, konstanty, typy), přesuň je do nových modulů ve stejné složce a importuj je.",
			`- Každý výsledný soubor drž pod ${WARN_FILE_LINES} řádky (tvrdý limit ${MAX_FILE_LINES}).`,
		].join("\n");
	}
	return undefined;
}
