// manifest.ts — herdr-plugin.toml validation against the herdr 0.9.5 plugin rules. Pure; no `$`.
//
//   validateManifest(text) → { errors, warnings }   errors block a link/install; warnings are advice

import { parseToml, TomlError } from "./toml";
import type { TomlTable, TomlValue } from "./toml";

export type ManifestReport = { errors: string[]; warnings: string[] };

const PLUGIN_ID = /^[A-Za-z0-9._:-]+$/;
const LOCAL_ID = /^[A-Za-z0-9:_-]+$/;
const VERSION = /^\d+(\.\d+){1,2}([-+][0-9A-Za-z.-]+)?$/;
const PLATFORMS = ["linux", "macos", "windows"];
const PLACEMENTS = ["overlay", "popup", "split", "tab", "zoomed"];
const REQUIRED = ["id", "name", "version", "min_herdr_version"] as const;

const isTable = (v: TomlValue | undefined): v is TomlTable => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrings = (v: TomlValue | undefined): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** The `[[name]]` tables; a non-array value is reported once and read as empty. */
function tablesOf(root: TomlTable, name: string, errors: string[]): TomlTable[] {
	const v = root[name];
	if (v === undefined) return [];
	if (!Array.isArray(v) || !v.every(isTable)) {
		errors.push(`'${name}' must be an array of tables ([[${name}]])`);
		return [];
	}
	return v as TomlTable[];
}

function checkPlatforms(where: string, v: TomlValue | undefined, errors: string[]): void {
	if (v === undefined) return;
	if (!isStrings(v)) return void errors.push(`${where}: 'platforms' must be an array of strings`);
	for (const p of v) if (!PLATFORMS.includes(p)) errors.push(`${where}: unknown platform '${p}' (use ${PLATFORMS.join(", ")})`);
}

function checkCommand(where: string, t: TomlTable, errors: string[]): void {
	const c = t.command;
	if (c === undefined) return void errors.push(`${where}: missing 'command' (an argv array)`);
	if (!isStrings(c) || c.length === 0 || c[0] === "") errors.push(`${where}: 'command' must be a non-empty argv array of strings`);
}

function requireString(where: string, t: TomlTable, key: string, errors: string[]): string | undefined {
	const v = t[key];
	if (v === undefined) return void errors.push(`${where}: missing '${key}'`);
	if (typeof v !== "string" || v.trim() === "") return void errors.push(`${where}: '${key}' must be a non-empty string`);
	return v;
}

/** Local ids of one kind: required, no dots, unique. */
function checkIds(kind: string, items: TomlTable[], errors: string[]): string[] {
	const seen: string[] = [];
	items.forEach((t, i) => {
		const where = `[[${kind}]] #${i + 1}`;
		const id = requireString(where, t, "id", errors);
		if (id === undefined) return;
		if (!LOCAL_ID.test(id)) errors.push(`${where}: invalid id '${id}' (letters, digits, ':', '_', '-'; no dots)`);
		if (seen.includes(id)) errors.push(`${where}: duplicate id '${id}'`);
		seen.push(id);
	});
	return seen;
}

function checkSize(where: string, key: string, v: TomlValue | undefined, errors: string[]): void {
	if (v === undefined) return;
	const ok = (typeof v === "number" && v > 0) || (typeof v === "string" && /^\d+%$/.test(v));
	if (!ok) errors.push(`${where}: '${key}' must be a number of cells or a percentage string like "80%"`);
}

export function validateManifest(text: string): ManifestReport {
	const errors: string[] = [];
	const warnings: string[] = [];
	let root: TomlTable;
	try {
		root = parseToml(text);
	} catch (error) {
		if (!(error instanceof TomlError)) throw error;
		return { errors: [`TOML: ${error.message}`], warnings };
	}

	for (const key of REQUIRED) if (root[key] === undefined) errors.push(`Missing required top-level field: '${key}'`);
	const id = root.id;
	if (id !== undefined && (typeof id !== "string" || !PLUGIN_ID.test(id))) errors.push(`Invalid 'id': ${JSON.stringify(id)} (letters, digits, '.', ':', '_', '-')`);
	for (const key of ["name", "description"]) {
		const v = root[key];
		if (v !== undefined && (typeof v !== "string" || v.trim() === "")) errors.push(`'${key}' must be a non-empty string`);
	}
	for (const key of ["version", "min_herdr_version"]) {
		const v = root[key];
		if (v !== undefined && (typeof v !== "string" || !VERSION.test(v))) errors.push(`'${key}' must be a version like "0.7.0"`);
	}
	checkPlatforms("top level", root.platforms, errors);
	if (root.platforms === undefined) warnings.push("No top-level 'platforms': a local plugin links with a warning");

	for (const [i, t] of tablesOf(root, "build", errors).entries()) {
		checkCommand(`[[build]] #${i + 1}`, t, errors);
		checkPlatforms(`[[build]] #${i + 1}`, t.platforms, errors);
	}
	for (const [i, t] of tablesOf(root, "startup", errors).entries()) {
		checkCommand(`[[startup]] #${i + 1}`, t, errors);
		checkPlatforms(`[[startup]] #${i + 1}`, t.platforms, errors);
	}
	const events = tablesOf(root, "events", errors);
	events.forEach((t, i) => {
		const where = `[[events]] #${i + 1}`;
		requireString(where, t, "on", errors);
		checkCommand(where, t, errors);
		checkPlatforms(where, t.platforms, errors);
	});

	const actions = tablesOf(root, "actions", errors);
	const actionIds = checkIds("actions", actions, errors);
	actions.forEach((t, i) => {
		const where = `[[actions]] #${i + 1}`;
		requireString(where, t, "title", errors);
		checkCommand(where, t, errors);
		checkPlatforms(where, t.platforms, errors);
		if (t.contexts !== undefined && !isStrings(t.contexts)) errors.push(`${where}: 'contexts' must be an array of strings`);
	});

	const panes = tablesOf(root, "panes", errors);
	checkIds("panes", panes, errors);
	panes.forEach((t, i) => {
		const where = `[[panes]] #${i + 1}`;
		requireString(where, t, "title", errors);
		checkCommand(where, t, errors);
		checkPlatforms(where, t.platforms, errors);
		const p = t.placement;
		if (p !== undefined && (typeof p !== "string" || !PLACEMENTS.includes(p))) errors.push(`${where}: 'placement' must be one of ${PLACEMENTS.join(", ")}`);
		checkSize(where, "width", t.width, errors);
		checkSize(where, "height", t.height, errors);
	});

	const handlers = tablesOf(root, "link_handlers", errors);
	checkIds("link_handlers", handlers, errors);
	handlers.forEach((t, i) => {
		const where = `[[link_handlers]] #${i + 1}`;
		const pattern = requireString(where, t, "pattern", errors);
		if (pattern !== undefined) {
			try {
				new RegExp(pattern);
			} catch {
				errors.push(`${where}: 'pattern' is not a valid regular expression`);
			}
		}
		const action = requireString(where, t, "action", errors);
		if (action !== undefined && !actionIds.includes(action)) errors.push(`${where}: 'action' '${action}' is not an action declared in this manifest`);
	});

	return { errors, warnings };
}
