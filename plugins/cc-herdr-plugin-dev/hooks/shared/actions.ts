// actions.ts — the two things the plugin does to the disk, used by the tools and by the /herdr-plugin command.
//
//   scaffoldPlugin($, dir, opts)  writes a starter project; refuses to overwrite an existing manifest
//   validateAt($, path)           reads herdr-plugin.toml (or a folder holding it) and validates it
//
// Failures are returned as `{ error }` text, never thrown: the callers show it to the model or the person.

import type { EngineInterface } from "claude-code";
import { validateManifest } from "./manifest";
import type { ManifestReport } from "./manifest";
import { MANIFEST } from "./project";
import { checkScaffold, scaffoldFiles } from "./scaffold";
import type { ScaffoldOptions } from "./scaffold";

type $ = EngineInterface;

const trimSlash = (p: string): string => p.replace(/[\\/]+$/, "") || p;
const message = (e: unknown): string => (e instanceof Error ? e.message.split("\n")[0] : String(e)) ?? "";

export async function scaffoldPlugin($: $, dir: string, opts: ScaffoldOptions): Promise<{ files: string[] } | { error: string }> {
	const bad = checkScaffold(opts);
	if (bad) return { error: bad };
	const root = trimSlash(dir);
	try {
		if (await $.fs.exists(`${root}/${MANIFEST}`)) return { error: `${root}/${MANIFEST} already exists; nothing was written.` };
		const files = scaffoldFiles(opts);
		for (const [rel, text] of Object.entries(files)) await $.fs.write(`${root}/${rel}`, text);
		return { files: Object.keys(files) };
	} catch (error) {
		return { error: `Could not write ${root}: ${message(error)}` };
	}
}

export async function validateAt($: $, path: string): Promise<({ path: string } & ManifestReport) | { error: string }> {
	const given = trimSlash(path);
	const file = given.endsWith(".toml") ? given : `${given}/${MANIFEST}`;
	try {
		if (!(await $.fs.exists(file))) return { error: `Manifest not found at ${file}.` };
		return { path: file, ...validateManifest(await $.fs.read(file)) };
	} catch (error) {
		return { error: `Could not read ${file}: ${message(error)}` };
	}
}
