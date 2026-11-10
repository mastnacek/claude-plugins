import { describe, expect, test } from "claude-code/testing";
import { canCheck, isAlreadyCzechOrSlovak } from "./already-target";

describe("isAlreadyCzechOrSlovak", () => {
	test("české odpovědi z testu s Haiku se poznají", () => {
		expect(isAlreadyCzechOrSlovak("Soubor `pozdrav.py` jsem vytvořil v pracovním adresáři projektu. Spuštěním se vypsalo `Ahoj světe`.")).toBe(true);
		expect(isAlreadyCzechOrSlovak("Program pozdrav.py se nyní nejprve zeptá na jméno a poté daného člověka pozdraví.")).toBe(true);
	});

	test("anglická odpověď s citovanou češtinou se dál překládá", () => {
		expect(isAlreadyCzechOrSlovak('I created pozdrav.py, which prints "Ahoj světe", and ran it successfully.')).toBe(false);
		expect(isAlreadyCzechOrSlovak("The file is in /tmp/pt-test/záloha/pozdrav_old.py and the tests pass.")).toBe(false);
		expect(isAlreadyCzechOrSlovak("Here is the code:\n```python\nprint(\"Ahoj, světe! Jak se máš?\")\n```\nRun it with python3.")).toBe(false);
	});

	test("krátký text nerozhoduje", () => {
		expect(isAlreadyCzechOrSlovak("Hotovo, díky.")).toBe(false);
	});

	test("kontrola jen pro češtinu a slovenštinu", () => {
		expect(canCheck("Czech")).toBe(true);
		expect(canCheck("Slovak")).toBe(true);
		expect(canCheck("German")).toBe(false);
	});
});
