import { describe, expect, test } from "claude-code/testing";
import { hasDeicticReferences } from "./history";

describe("hasDeicticReferences", () => {
	test("odkazovací slova v promptu se poznají", () => {
		for (const text of ["udělej to samé i pro tu druhou funkci", "oprav to", "předchozí verze"]) {
			expect(hasDeicticReferences(text), text).toBe(true);
		}
	});
	test("prompt bez odkazovacích slov se pozná jako samostatný", () => {
		for (const text of ["oprav chybu v parseru", "přidej test"]) {
			expect(hasDeicticReferences(text), text).toBe(false);
		}
	});
	test("slovo uvnitř jiného slova se nepočítá", () => {
		// „to“ v „token“, „ta“ v „tabulka“, „další“ v „dalšímu“
		for (const text of ["token", "tabulka", "dalšímu"]) {
			expect(hasDeicticReferences(text), text).toBe(false);
		}
	});
	test("velká písmena nevadí", () => {
		expect(hasDeicticReferences("Oprav TO")).toBe(true);
		expect(hasDeicticReferences("Předchozí verze")).toBe(true);
	});
});
