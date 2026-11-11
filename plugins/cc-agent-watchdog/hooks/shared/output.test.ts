import { expect, test } from "claude-code/testing";
import { requests } from "./output";

test("requests declines: 1 žádost, 2–4 žádosti, 0 and 5+ žádostí", () => {
	expect([0, 1, 2, 4, 5, 11].map(requests)).toEqual(["0 žádostí", "1 žádost", "2 žádosti", "4 žádosti", "5 žádostí", "11 žádostí"]);
});
