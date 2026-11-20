import type { EngineInterface, Register } from "claude-code";
import { atom, read, update } from "claude-code";
import { CONSENT_PANE, settleConsent } from "../../shared/consent";
import { kindColor } from "../../shared/findings";
import type { FileFindings } from "../../../types";

// Declared in each file that touches it: the engine's scan reads the ref where it is used.
const findings = atom({ plugin: "cc-data-anonymizer", key: "findings" } as const, null);
const cards = atom({ plugin: "cc-data-anonymizer", key: "cards" } as const, null);
const warning = atom({ plugin: "cc-data-anonymizer", key: "redactWarning" } as const, null);


type Els = ReturnType<EngineInterface["ui"]["resolve"]>;

// The colored list of findings: each file once, then its lines (kind colored).
// `max` caps the finding lines (the ask dialog may hold only a few rows).
function renderGroups(groups: readonly FileFindings[], Box: Els["Box"], Text: Els["Text"], max = Infinity) {
	let left = max;
	let hidden = 0;
	const files = groups.map((g) => {
		const shown = g.lines.slice(0, Math.max(left, 0));
		left -= shown.length;
		hidden += g.lines.length - shown.length;
		return { path: g.path, lines: shown };
	});
	return (
		<Box flexDirection="column">
			{files
				.filter((g) => g.lines.length > 0)
				.map((g) => (
					<Box key={g.path} flexDirection="column">
						<Text bold>{g.path}</Text>
						{g.lines.map((l) => (
							<Text key={`${l.line}:${l.column}`}>
								{"  "}
								<Text dimColor>
									{l.line}:{l.column}
								</Text>
								{"  "}
								<Text color={kindColor(l.kind)} bold={kindColor(l.kind) === "error"}>
									{l.kind}
								</Text>
								{"  "}
								<Text dimColor>{l.rule}</Text>
								{"  "}
								{l.chars} znaků
								{l.shown !== undefined && <Text bold>{"  " + l.shown}</Text>}
							</Text>
						))}
					</Box>
				))}
			{hidden > 0 && <Text dimColor>… a {hidden} dalších</Text>}
		</Box>
	);
}

// The consent pane lists what `anon scan` found: each file once, then its lines
// (kind colored), and two buttons. The band above the prompt only carries the redact warning.
export const registerFindingsBand = ((on) => {
	// A redact warning stays until the next turn starts.
	on("turn.start", async ($, e, next) => {
		await update($, warning, () => null);
		return next(e);
	});

	on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
		const warn = await read($, warning);
		if (warn === null) return next(e);
		const { Box, Text } = $.ui.resolve(e);
		return (
			<Box borderStyle="round" borderColor="warning" paddingX={1}>
				<Text color="warning">🔒 anon · {warn}</Text>
			</Box>
		);
	});

	// The findings as a card under the tool's row: works at any terminal width.
	on("ui.render", { component: "ToolUse" }, async ($, e, next) => {
		const card = (await read($, cards))?.[e.props.tool_use_id];
		const row = await next(e);
		if (card === undefined) return row;
		const { Box, Text } = $.ui.resolve(e);
		const decision = card.decision;
		return (
			<Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
				{row}
				<Text bold>🔒 anon: citlivé hodnoty</Text>
				{renderGroups(card.groups, Box, Text)}
				{decision !== null && (
					<Text color={decision.isAllowed ? "success" : "error"} bold>
						{decision.isAllowed ? `✔ povoleno (zamaskováno, styl ${decision.style})` : "✘ zamítnuto"}
					</Text>
				)}
			</Box>
		);
	});

	// The card under the tool row is not drawn while the tool.call hook waits: show the findings
	// above the ask dialog, which is drawn during the wait.
	on("ui.render", { component: "AskUserQuestion" }, async ($, e, next) => {
		const groups = await read($, findings);
		const dialog = await next(e);
		if (groups === null) return dialog;
		const { Box, Text } = $.ui.resolve(e);
		return (
			<Box flexDirection="column">
				<Text bold>🔒 anon: citlivé hodnoty</Text>
				{renderGroups(groups, Box, Text, 6)}
				{dialog}
			</Box>
		);
	});

	on("ui.render", { component: "Pane", requestId: CONSENT_PANE }, async ($, e) => {
		const groups = (await read($, findings)) ?? [];
		const { Box, Text, Button } = $.ui.resolve(e);
		return (
			<Box flexDirection="column" paddingX={1}>
				<Text bold>🔒 anon: citlivé hodnoty</Text>
				{renderGroups(groups, Box, Text)}
				<Text dimColor>Agent uvidí jen falešné náhrady.</Text>
				<Box flexDirection="row" gap={2}>
					<Button key="allow" variant="primary" autoFocus onPress={() => settleConsent(true)}>
						Povolit (Enter)
					</Button>
					<Button key="deny" onPress={() => settleConsent(false)}>
						Zamítnout (Esc)
					</Button>
				</Box>
			</Box>
		);
	});

	// Closing the pane (Esc, the close mark) is a refusal.
	on("ui.close", { id: CONSENT_PANE }, async ($, e, next) => {
		settleConsent(false);
		return next(e);
	});
}) satisfies Register;
