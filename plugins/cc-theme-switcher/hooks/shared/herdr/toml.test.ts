import { describe, expect, test } from "claude-code/testing";
import { updateTomlTheme, updateTomlThemeDetails } from "./toml";

/**
 * A small TOML reader, enough for these fixtures: tables, array tables, dotted
 * keys, inline tables, strings, booleans and integers. It checks the result as
 * data instead of by its text.
 */
// biome-ignore lint/suspicious/noExplicitAny: a generic parsed document
function parse(text: string): any {
	// biome-ignore lint/suspicious/noExplicitAny: a generic parsed document
	const root: Record<string, any> = {};
	// biome-ignore lint/suspicious/noExplicitAny: a generic parsed document
	let table: Record<string, any> = root;
	const stripComment = (line: string): string => {
		let quote = "";
		for (let i = 0; i < line.length; i++) {
			const c = line[i] as string;
			if (quote) {
				if (c === "\\" && quote === '"') i++;
				else if (c === quote) quote = "";
			} else if (c === '"' || c === "'") quote = c;
			else if (c === "#") return line.slice(0, i);
		}
		return line;
	};
	const splitTop = (text: string): string[] => {
		const parts: string[] = [];
		let depth = 0;
		let quote = "";
		let cur = "";
		for (const c of text) {
			if (quote) {
				if (c === quote) quote = "";
			} else if (c === '"' || c === "'") quote = c;
			else if (c === "{") depth++;
			else if (c === "}") depth--;
			if (c === "," && depth === 0 && !quote) {
				parts.push(cur);
				cur = "";
			} else cur += c;
		}
		if (cur.trim()) parts.push(cur);
		return parts;
	};
	const value = (raw: string): unknown => {
		const v = raw.trim();
		if (v.startsWith('"') || v.startsWith("'")) return v.slice(1, -1);
		if (v === "true") return true;
		if (v === "false") return false;
		if (v.startsWith("{")) {
			const obj: Record<string, unknown> = {};
			for (const pair of splitTop(v.slice(1, -1))) assign(obj, pair);
			return obj;
		}
		return Number(v);
	};
	// biome-ignore lint/suspicious/noExplicitAny: a generic parsed document
	const descend = (from: Record<string, any>, path: string[]): Record<string, any> => {
		let at = from;
		for (const key of path) {
			const next = at[key];
			at = Array.isArray(next) ? (next[next.length - 1] as typeof at) : (at[key] ??= {});
		}
		return at;
	};
	// biome-ignore lint/suspicious/noExplicitAny: a generic parsed document
	const assign = (into: Record<string, any>, pair: string): void => {
		const eq = pair.indexOf("=");
		const path = pair.slice(0, eq).trim().split(".");
		const last = path.pop() as string;
		descend(into, path)[last] = value(pair.slice(eq + 1));
	};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = stripComment(rawLine).trim();
		if (!line) continue;
		const array = /^\[\[(.+)\]\]$/.exec(line);
		const plain = /^\[(.+)\]$/.exec(line);
		if (array) {
			const path = (array[1] as string).trim().split(".");
			const last = path.pop() as string;
			const parent = descend(root, path);
			// biome-ignore lint/suspicious/noExplicitAny: a generic parsed document
			const list = (parent[last] ??= []) as Array<Record<string, any>>;
			table = {};
			list.push(table);
		} else if (plain) {
			table = descend(root, (plain[1] as string).trim().split("."));
		} else assign(table, line);
	}
	return root;
}

describe("updateTomlTheme (parsed TOML structural verification)", () => {
	test("appends [theme] section to empty or non-theme toml", () => {
		const emptyResult = updateTomlTheme("", "solarized-light");
		const p1 = parse(emptyResult);
		expect(p1.theme?.name).toBe("solarized-light");
		expect(p1.theme?.auto_switch).toBe(false);

		const result = updateTomlTheme("[terminal]\nshell = \"bash\"\n", "catppuccin");
		const p2 = parse(result);
		expect(p2.terminal?.shell).toBe("bash");
		expect(p2.theme?.name).toBe("catppuccin");
		expect(p2.theme?.auto_switch).toBe(false);
	});

	test("replaces existing name under [theme] section", () => {
		const existing = `[theme]\nname = "dracula"\nauto_switch = false\n\n[terminal]\nshell = "pwsh"`;
		const result = updateTomlTheme(existing, "rose-pine");
		const parsed = parse(result);
		expect(parsed.theme?.name).toBe("rose-pine");
		expect(parsed.theme?.auto_switch).toBe(false);
		expect(parsed.terminal?.shell).toBe("pwsh");
	});

	test("inserts name and disables auto_switch under existing [theme] section", () => {
		const existing = `[theme]\nauto_switch = true\n\n[terminal]\nshell = "pwsh"`;
		const result = updateTomlTheme(existing, "gruvbox");
		const parsed = parse(result);
		expect(parsed.theme?.name).toBe("gruvbox");
		expect(parsed.theme?.auto_switch).toBe(false);
		expect(parsed.terminal?.shell).toBe("pwsh");
	});

	test("handles [theme] section headers with comments and preserves inline comments", () => {
		const existing = `[theme] # User config\nname = "dracula" # default\nauto_switch = true # follower\n\n[ui]\nx = 24`;
		const result = updateTomlTheme(existing, "catppuccin-latte");
		const parsed = parse(result);
		expect(parsed.theme?.name).toBe("catppuccin-latte");
		expect(parsed.theme?.auto_switch).toBe(false);
		expect(parsed.ui?.x).toBe(24);
		expect(result.includes('name = "catppuccin-latte" # default')).toBe(true);
		expect(result.includes("auto_switch = false # follower")).toBe(true);
	});

	test("handles '#' inside basic and literal strings without corrupting into fake comments (regression)", () => {
		const basicNoComment = `[theme]\nname = "my#theme"\n`;
		const res1 = updateTomlTheme(basicNoComment, "nord");
		expect((parse(res1) as any).theme?.name).toBe("nord");
		expect(res1.includes('name = "nord"\n')).toBe(true);

		const basicWithComment = `[theme]\nname = "my#theme" # real comment\n`;
		const res2 = updateTomlTheme(basicWithComment, "nord");
		expect((parse(res2) as any).theme?.name).toBe("nord");
		expect(res2.includes('name = "nord" # real comment\n')).toBe(true);

		const literalNoComment = `[theme]\nname = 'my#literal#theme'\n`;
		const res3 = updateTomlTheme(literalNoComment, "nord");
		expect((parse(res3) as any).theme?.name).toBe("nord");
		expect(res3.includes('name = "nord"\n')).toBe(true);

		const literalWithComment = `[theme]\nname = 'my#literal#theme' # literal comment\n`;
		const res4 = updateTomlTheme(literalWithComment, "nord");
		expect((parse(res4) as any).theme?.name).toBe("nord");
		expect(res4.includes('name = "nord" # literal comment\n')).toBe(true);
	});

	test("handles top-level dotted theme.name and theme.auto_switch keys", () => {
		const dotted = `theme.name = "nord"\ntheme.auto_switch = true\n\n[terminal]\nshell = "bash"`;
		const result = updateTomlTheme(dotted, "solarized-light");
		const parsed = parse(result);
		expect(parsed.theme?.name).toBe("solarized-light");
		expect(parsed.theme?.auto_switch).toBe(false);
		expect(parsed.terminal?.shell).toBe("bash");
		expect(!result.includes("[theme]"), "no duplicate table").toBe(true);
	});

	test("preserves CRLF line endings when present", () => {
		const crlf = "[theme]\r\nname = \"dracula\"\r\n\r\n[terminal]\r\nshell = \"pwsh\"\r\n";
		const res = updateTomlTheme(crlf, "gruvbox");
		expect(res.includes("\r\n"), "maintains CRLF").toBe(true);
		const parsed = parse(res);
		expect(parsed.theme?.name).toBe("gruvbox");
		expect(parsed.terminal?.shell).toBe("pwsh");
	});

	test("terminates [theme] at array-of-tables and preserves keybinding name (regression: Repro A)", () => {
		const reproA = `[theme]\nauto_switch = false\n\n[[keys.command]]\nkey = "prefix+k"\nname = "keep-me"\n`;
		const res = updateTomlTheme(reproA, "nord");
		const parsed = parse(res);
		expect(parsed.theme?.name).toBe("nord");
		expect(parsed.theme?.auto_switch).toBe(false);
		expect(parsed.keys?.command?.length).toBe(1);
		expect(parsed.keys?.command?.[0]?.key).toBe("prefix+k");
		expect(parsed.keys?.command?.[0]?.name).toBe("keep-me");
	});

	test("inserts missing theme name inside [theme] before subsequent array-of-tables (regression: Repro B)", () => {
		const reproB = `[theme]\n\n[[keys.command]]\nkey = "prefix+k"\n`;
		const res = updateTomlTheme(reproB, "nord");
		const parsed = parse(res);
		expect(parsed.theme?.name).toBe("nord");
		expect(parsed.keys?.command?.length).toBe(1);
		expect(parsed.keys?.command?.[0]?.key).toBe("prefix+k");
		expect(parsed.keys?.command?.[0]?.name).toBe(undefined);
	});

	test("handles top-level dotted theme.* key without theme.name and avoids duplicate [theme] (regression: Repro C)", () => {
		const reproC = `theme.auto_switch = true\n[ui]\nx = 1\n`;
		const details = updateTomlThemeDetails(reproC, "nord");
		expect(details.autoSwitchDisabled).toBe(true);
		const parsed = parse(details.content);
		expect(parsed.theme?.name).toBe("nord");
		expect(parsed.theme?.auto_switch).toBe(false);
		expect(parsed.ui?.x).toBe(1);
		expect(!details.content.includes("[theme]"), "does not append duplicate [theme] table").toBe(true);
	});

	test("handles inline table theme = { ... } at top level", () => {
		const inline = `theme = { auto_switch = true }\n[terminal]\nshell = "bash"\n`;
		const details = updateTomlThemeDetails(inline, "nord");
		expect(details.autoSwitchDisabled).toBe(true);
		const parsed = parse(details.content);
		expect(parsed.theme?.name).toBe("nord");
		expect(parsed.theme?.auto_switch).toBe(false);
		expect(parsed.terminal?.shell).toBe("bash");
		expect(!details.content.includes("[theme]")).toBe(true);
	});

	test("creates [theme.custom] with sidebar_bg when sidebarBg is supplied", () => {
		const toml = `[theme]\nname = "nord"\nauto_switch = false\n\n[[keys.command]]\nkey = "prefix+k"\n`;
		const res = updateTomlTheme(toml, "solarized-light", "#fdf6e3");
		const parsed = parse(res);
		expect(parsed.theme?.name).toBe("solarized-light");
		expect(parsed.theme?.custom?.sidebar_bg).toBe("#fdf6e3");
		expect(parsed.keys?.command?.[0]?.key).toBe("prefix+k");
	});

	test("updates existing [theme.custom] sidebar_bg without breaking other keys in theme.custom", () => {
		const toml = `[theme]\nname = "nord"\n\n[theme.custom]\naccent = "#ff0000"\nsidebar_bg = "#2e3440" # old\nsidebar_fg = "#eceff4"\n\n[ui]\nx = 1\n`;
		const res = updateTomlTheme(toml, "solarized-light", "#fdf6e3");
		const parsed = parse(res);
		expect(parsed.theme?.name).toBe("solarized-light");
		expect(parsed.theme?.custom?.sidebar_bg).toBe("#fdf6e3");
		expect(parsed.theme?.custom?.accent).toBe("#ff0000");
		expect(parsed.theme?.custom?.sidebar_fg).toBe("#eceff4");
		expect(parsed.ui?.x).toBe(1);
		expect(res.includes('sidebar_bg = "#fdf6e3" # old')).toBe(true);
	});

	test("inserts sidebar_bg into existing [theme.custom] when sidebar_bg was omitted", () => {
		const toml = `[theme]\nname = "nord"\n\n[theme.custom]\naccent = "#ff0000"\n`;
		const res = updateTomlTheme(toml, "rose-pine", "#12061a");
		const parsed = parse(res);
		expect(parsed.theme?.name).toBe("rose-pine");
		expect(parsed.theme?.custom?.accent).toBe("#ff0000");
		expect(parsed.theme?.custom?.sidebar_bg).toBe("#12061a");
	});

	test("updates dotted theme.custom.sidebar_bg at top level", () => {
		const toml = `theme.name = "nord"\ntheme.custom.sidebar_bg = "#old"\n[ui]\nx = 1\n`;
		const res = updateTomlTheme(toml, "solarized-light", "#fdf6e3");
		const parsed = parse(res);
		expect(parsed.theme?.name).toBe("solarized-light");
		expect(parsed.theme?.custom?.sidebar_bg).toBe("#fdf6e3");
		expect(parsed.ui?.x).toBe(1);
		expect(!res.includes("[theme.custom]")).toBe(true);
	});

	test("golden test: updates real user config shape line-by-line and preserves CRLF", () => {
		const lines = [
			'onboarding = true',
			'agent_panel_sort = "alpha"',
			'',
			'[update]',
			'check_on_startup = true',
			'',
			'[ui.toast]',
			'duration_ms = 3000',
			'',
			'[ui]',
			'sidebar_width = 24',
			'',
			'[theme]',
			'name = "old-theme"',
			'auto_switch = false',
			'',
			'[[keys.command]]',
			'key = "prefix+1"',
			'action = "focus_pane_1"',
			'',
			'[[keys.command]]',
			'key = "prefix+2"',
			'action = "focus_pane_2"',
			'',
			'[[keys.command]]',
			'key = "prefix+c"',
			'action = "new_tab"',
			'',
			'[[keys.command]]',
			'key = "prefix+x"',
			'action = "close_pane"',
			'',
			'[[keys.command]]',
			'key = "prefix+k"',
			'name = "custom-kill"',
			'action = "kill_pane"',
			'',
		];
		const goldenConfig = lines.join("\r\n");
		const updated = updateTomlTheme(goldenConfig, "solarized-light");

		expect(updated.includes("\r\n"), "line endings must stay CRLF").toBe(true);
		const originalLines = goldenConfig.split("\r\n");
		const updatedLines = updated.split("\r\n");
		expect(updatedLines.length, "line count unchanged").toBe(originalLines.length);

		let changedLineCount = 0;
		for (let i = 0; i < originalLines.length; i++) {
			if (originalLines[i] !== updatedLines[i]) {
				changedLineCount++;
				expect(originalLines[i]).toBe('name = "old-theme"');
				expect(updatedLines[i]).toBe('name = "solarized-light"');
			}
		}
		expect(changedLineCount, "exactly one line modified").toBe(1);

		const parsed = parse(updated);
		expect(parsed.onboarding).toBe(true);
		expect(parsed.agent_panel_sort).toBe("alpha");
		expect(parsed.update?.check_on_startup).toBe(true);
		expect(parsed.ui?.toast?.duration_ms).toBe(3000);
		expect(parsed.ui?.sidebar_width).toBe(24);
		expect(parsed.theme?.name).toBe("solarized-light");
		expect(parsed.theme?.auto_switch).toBe(false);
		expect(parsed.keys?.command?.length).toBe(5);
		expect(parsed.keys?.command?.[4]?.name).toBe("custom-kill");
		expect(parsed.keys?.command?.[4]?.action).toBe("kill_pane");
	});

	test("idempotency: update(update(x)) === update(x) across diverse fixtures", () => {
		const fixtures = [
			"",
			"[terminal]\nshell = \"bash\"\n",
			"[theme]\nname = \"dracula\"\nauto_switch = false\n",
			"[theme]\nauto_switch = true\n",
			"[theme] # comment\nname = \"dracula\" # mine\nauto_switch = true # auto\n",
			"theme.name = \"nord\"\ntheme.auto_switch = true\n",
			"theme.auto_switch = true\n[ui]\nx = 1\n",
			"theme = { auto_switch = true }\n[terminal]\nshell = \"bash\"\n",
			"[theme]\nauto_switch = false\n\n[[keys.command]]\nkey = \"prefix+k\"\nname = \"keep-me\"\n",
			"[theme]\n\n[[keys.command]]\nkey = \"prefix+k\"\n",
			"[theme]\nname = \"nord\"\n\n[theme.custom]\nsidebar_bg = \"#111\"\nsidebar_fg = \"#fff\"\n",
		];

		for (const f of fixtures) {
			const once = updateTomlTheme(f, "nord", "#2e3440");
			const twice = updateTomlTheme(once, "nord", "#2e3440");
			expect(twice, `idempotent on: ${JSON.stringify(f)}`).toBe(once);

			const changedOnce = updateTomlTheme(once, "gruvbox", "#282828");
			const changedTwice = updateTomlTheme(changedOnce, "gruvbox", "#282828");
			expect(changedTwice, `idempotent re-switch on: ${JSON.stringify(f)}`).toBe(changedOnce);
		}
	});
});
