/**
 * Line-based TOML updating utility for Herdr multiplexer configuration.
 * Handles [theme] and [theme.custom] tables, array-of-tables, top-level dotted keys,
 * and inline tables, preserving comments and formatting.
 */

export interface UpdateTomlThemeResult {
	content: string;
	autoSwitchDisabled: boolean;
}

function extractInlineComment(line: string): string {
	const match =
		/^\s*[\w.]+\s*=\s*(?:"(?:[^"\\]|\\.)*"|'[^']*'|[^\s#]+)(\s*#.*)?$/.exec(line);
	return match && match[1] ? match[1] : "";
}

/**
 * Updates or inserts the theme name and optional sidebar background in a TOML string.
 * Supports [theme] and [theme.custom] headers with comments/spaces, array-of-tables headers ([[keys.command]]),
 * top-level dotted theme.* keys, inline tables, and automatically disables auto_switch.
 */
export function updateTomlThemeDetails(
	tomlContent: string,
	newTheme: string,
	sidebarBg?: string,
): UpdateTomlThemeResult {
	const eol = tomlContent.includes("\r\n") ? "\r\n" : "\n";
	const lines = tomlContent.split(/\r?\n/);
	let inThemeSection = false;
	let inThemeCustomSection = false;
	let inAnySection = false;
	let nameReplaced = false;
	let sidebarBgReplaced = false;
	let hasThemeSection = false;
	let hasThemeCustomTable = false;
	let autoSwitchDisabled = false;
	const outputLines: string[] = [];

	let hasTopLevelThemeDotted = false;
	let hasTopLevelThemeName = false;
	let hasTopLevelThemeCustomSidebarBg = false;
	let hasTopLevelThemeInline = false;
	let lastTopLevelThemeIdx = -1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (/^\s*\[\[?\s*([^\]]+?)\s*\]\]?(?:\s*#.*)?$/.test(line)) {
			break;
		}
		if (/^\s*theme\.[a-zA-Z0-9_.-]+\s*=/.test(line)) {
			hasTopLevelThemeDotted = true;
			lastTopLevelThemeIdx = i;
			if (/^\s*theme\.name\s*=/.test(line)) hasTopLevelThemeName = true;
			if (/^\s*theme\.custom\.sidebar_bg\s*=/.test(line)) {
				hasTopLevelThemeCustomSidebarBg = true;
			}
		}
	}

	for (const line of lines) {
		if (/^\s*\[\s*theme\.custom\s*\](?:\s*#.*)?$/.test(line)) {
			hasThemeCustomTable = true;
			break;
		}
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";

		if (!inAnySection) {
			const inlineMatch = /^\s*theme\s*=\s*\{(.*)\}(?:\s*(#.*))?$/.exec(line);
			if (inlineMatch) {
				hasTopLevelThemeInline = true;
				let inner = (inlineMatch[1] ?? "").trim();
				if (!inner.includes("name")) {
					inner = `name = "${newTheme}"${inner ? ", " + inner : ""}`;
				} else {
					inner = inner.replace(
						/name\s*=\s*(?:"[^"]*"|'[^']*'|[^\s,}]+)/,
						`name = "${newTheme}"`,
					);
				}
				if (inner.includes("auto_switch")) {
					inner = inner.replace(/auto_switch\s*=\s*true\b/, "auto_switch = false");
					autoSwitchDisabled = true;
				}
				if (sidebarBg) {
					if (/custom\s*=\s*\{/.test(inner)) {
						if (/sidebar_bg\s*=/.test(inner)) {
							inner = inner.replace(
								/sidebar_bg\s*=\s*(?:"[^"]*"|'[^']*')/,
								`sidebar_bg = "${sidebarBg}"`,
							);
						} else {
							inner = inner.replace(
								/custom\s*=\s*\{([^}]*)\}/,
								`custom = { sidebar_bg = "${sidebarBg}", $1 }`,
							);
						}
					} else {
						inner += `, custom = { sidebar_bg = "${sidebarBg}" }`;
					}
				}
				const comment = inlineMatch[2] ? ` ${inlineMatch[2]}` : "";
				outputLines.push(`theme = { ${inner.trim()} }${comment}`);
				continue;
			}

			if (hasTopLevelThemeDotted) {
				if (/^\s*theme\.name\s*=/.test(line)) {
					outputLines.push(`theme.name = "${newTheme}"${extractInlineComment(line)}`);
					nameReplaced = true;
					continue;
				}
				if (/^\s*theme\.auto_switch\s*=\s*true\b/.test(line)) {
					outputLines.push(`theme.auto_switch = false${extractInlineComment(line)}`);
					autoSwitchDisabled = true;
					if (i === lastTopLevelThemeIdx && !hasTopLevelThemeName && !nameReplaced) {
						outputLines.push(`theme.name = "${newTheme}"`);
						nameReplaced = true;
					}
					if (
						i === lastTopLevelThemeIdx &&
						sidebarBg &&
						!hasTopLevelThemeCustomSidebarBg &&
						!sidebarBgReplaced
					) {
						outputLines.push(`theme.custom.sidebar_bg = "${sidebarBg}"`);
						sidebarBgReplaced = true;
					}
					continue;
				}
				if (/^\s*theme\.custom\.sidebar_bg\s*=/.test(line)) {
					if (sidebarBg) {
						outputLines.push(
							`theme.custom.sidebar_bg = "${sidebarBg}"${extractInlineComment(line)}`,
						);
						sidebarBgReplaced = true;
					} else {
						outputLines.push(line);
					}
					continue;
				}
				if (i === lastTopLevelThemeIdx) {
					outputLines.push(line);
					if (!hasTopLevelThemeName && !nameReplaced) {
						outputLines.push(`theme.name = "${newTheme}"`);
						nameReplaced = true;
					}
					if (
						sidebarBg &&
						!hasTopLevelThemeCustomSidebarBg &&
						!sidebarBgReplaced
					) {
						outputLines.push(`theme.custom.sidebar_bg = "${sidebarBg}"`);
						sidebarBgReplaced = true;
					}
					continue;
				}
			}
		}

		const tableMatch = /^\s*\[\s*([^\]]+?)\s*\](?:\s*#.*)?$/.exec(line);
		const arrayTableMatch = /^\s*\[\[\s*([^\]]+?)\s*\]\](?:\s*#.*)?$/.exec(line);
		const isHeader = Boolean(tableMatch || arrayTableMatch);

		if (isHeader) {
			if (inThemeSection) {
				if (!nameReplaced) {
					outputLines.push(`name = "${newTheme}"`);
					nameReplaced = true;
				}
				if (sidebarBg && !hasThemeCustomTable && !sidebarBgReplaced) {
					outputLines.push("");
					outputLines.push("[theme.custom]");
					outputLines.push(`sidebar_bg = "${sidebarBg}"`);
					sidebarBgReplaced = true;
				}
			}
			if (inThemeCustomSection) {
				if (sidebarBg && !sidebarBgReplaced) {
					outputLines.push(`sidebar_bg = "${sidebarBg}"`);
					sidebarBgReplaced = true;
				}
			}

			inAnySection = true;
			if (tableMatch) {
				const tableName = (tableMatch[1] ?? "").trim();
				inThemeSection = tableName === "theme";
				inThemeCustomSection = tableName === "theme.custom";
				if (inThemeSection) hasThemeSection = true;
			} else {
				inThemeSection = false;
				inThemeCustomSection = false;
			}

			outputLines.push(line);
			continue;
		}

		if (inThemeSection) {
			if (/^\s*name\s*=/.test(line)) {
				outputLines.push(`name = "${newTheme}"${extractInlineComment(line)}`);
				nameReplaced = true;
				continue;
			}
			if (/^\s*auto_switch\s*=\s*true\b/.test(line)) {
				outputLines.push(`auto_switch = false${extractInlineComment(line)}`);
				autoSwitchDisabled = true;
				continue;
			}
		}

		if (inThemeCustomSection) {
			if (/^\s*sidebar_bg\s*=/.test(line)) {
				if (sidebarBg) {
					outputLines.push(
						`sidebar_bg = "${sidebarBg}"${extractInlineComment(line)}`,
					);
					sidebarBgReplaced = true;
					continue;
				}
			}
		}

		outputLines.push(line);
	}

	if (inThemeSection) {
		if (!nameReplaced) {
			outputLines.push(`name = "${newTheme}"`);
			nameReplaced = true;
		}
		if (sidebarBg && !hasThemeCustomTable && !sidebarBgReplaced) {
			outputLines.push("");
			outputLines.push("[theme.custom]");
			outputLines.push(`sidebar_bg = "${sidebarBg}"`);
			sidebarBgReplaced = true;
		}
	}

	if (inThemeCustomSection) {
		if (sidebarBg && !sidebarBgReplaced) {
			outputLines.push(`sidebar_bg = "${sidebarBg}"`);
			sidebarBgReplaced = true;
		}
	}

	if (!hasThemeSection && !hasTopLevelThemeDotted && !hasTopLevelThemeInline) {
		if (outputLines.length > 0 && outputLines.at(-1)?.trim() !== "") {
			outputLines.push("");
		}
		outputLines.push("[theme]");
		outputLines.push(`name = "${newTheme}"`);
		outputLines.push("auto_switch = false");
		if (sidebarBg) {
			outputLines.push("");
			outputLines.push("[theme.custom]");
			outputLines.push(`sidebar_bg = "${sidebarBg}"`);
		}
		autoSwitchDisabled = true;
	}

	let finalContent = outputLines.join(eol);
	if (tomlContent.endsWith("\n") && !finalContent.endsWith("\n")) {
		finalContent += eol;
	}

	return { content: finalContent, autoSwitchDisabled };
}

/**
 * Updates or inserts the [theme] name and optional [theme.custom] sidebar_bg in a TOML string.
 * Supports [theme] and [theme.custom] headers with comments/spaces, array-of-tables headers,
 * dotted theme.name keys, and disables auto_switch so Herdr honors the circadian theme.
 *
 * Note: Line-based parser designed for Herdr's config schema; does not support multiline """...""" strings.
 */
export function updateTomlTheme(
	tomlContent: string,
	newTheme: string,
	sidebarBg?: string,
): string {
	return updateTomlThemeDetails(tomlContent, newTheme, sidebarBg).content;
}
