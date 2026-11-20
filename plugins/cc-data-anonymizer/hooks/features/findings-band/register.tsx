import type { Register } from "claude-code";
import { atom, read, update } from "claude-code";
import { CONSENT_PANE, settleConsent } from "../../shared/consent";
import { kindColor } from "../../shared/findings";

// Declared in each file that touches it: the engine's scan reads the ref where it is used.
const findings = atom({ plugin: "cc-data-anonymizer", key: "findings" } as const, null);
const warning = atom({ plugin: "cc-data-anonymizer", key: "redactWarning" } as const, null);

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

	on("ui.render", { component: "Pane", requestId: CONSENT_PANE }, async ($, e) => {
		const groups = (await read($, findings)) ?? [];
		const { Box, Text, Button } = $.ui.resolve(e);
		return (
			<Box flexDirection="column" paddingX={1}>
				<Text bold>🔒 anon: citlivé hodnoty</Text>
				{groups.map((g) => (
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
							</Text>
						))}
					</Box>
				))}
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
