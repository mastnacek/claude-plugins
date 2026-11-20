import { expect, test } from "claude-code/testing";

const BAND = { plugin: "cc-data-anonymizer", component: "AbovePrompt", props: { hasSurvey: false }, surface: "terminal" } as const;

const stored = (value: unknown) => ({ value: { value, version: 1 } });

test("the band lists each file once with colored kinds while a dialog is open", async ($, on) => {
	on("state.get", () =>
		stored([{ path: "src/a.txt", lines: [{ line: 3, column: 1, kind: "password", rule: "vault", chars: 8 }] }]),
	);
	const ui = await $.ui.mount({ ...BAND });
	expect((await ui.find({ type: "Text", text: /src\/a\.txt/ }))?.text).toBe("src/a.txt");
	const kind = await ui.find({ type: "Text", text: /^password$/ });
	expect(kind?.props?.color).toBe("error");
	await ui.unmount();
});

test("no dialog, no band", async ($, on) => {
	on("state.get", () => stored(null));
	on("ui.render", ($, e) => {
		const { Text } = $.ui.resolve(e);
		return <Text>engine</Text>;
	});
	const ui = await $.ui.mount({ ...BAND });
	expect((await ui.find({ type: "Text" }))?.text).toBe("engine");
	await ui.unmount();
});
