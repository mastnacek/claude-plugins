import { expect, test } from "claude-code/testing";
import { partial, revealOf, shown } from "./reveal";

// Made-up values, built from parts so no scanner (or this plugin) takes them for real ones.
const SECRET = ["Zk9m", "Q2vLxTt"].join("");

test("partial keeps 2 and 2 characters, stars between, same length", () => {
	expect(partial(SECRET)).toBe(SECRET.slice(0, 2) + "*".repeat(SECRET.length - 4) + SECRET.slice(-2));
	expect(partial(SECRET)).toHaveLength(SECRET.length);
	expect(partial("abcd")).toBe("****");
});

test("names, e-mails, usernames, hosts and IPs show in full; secrets partially", () => {
	for (const kind of ["name", "email", "username", "host", "ip"]) expect(shown(kind, "Jan Novak", "partial")).toBe("Jan Novak");
	for (const kind of ["password", "secret", "card"]) expect(shown(kind, SECRET, "partial")).not.toContain(SECRET);
});

test("full shows everything, none shows nothing", () => {
	expect(shown("password", SECRET, "full")).toBe(SECRET);
	expect(shown("name", "Jan Novak", "none")).toBeUndefined();
});

test("the option defaults to partial", () => {
	expect(revealOf({})).toBe("partial");
	expect(revealOf({ reveal: "full" })).toBe("full");
	expect(revealOf({ reveal: "none" })).toBe("none");
	expect(revealOf({ reveal: "x" })).toBe("partial");
});
