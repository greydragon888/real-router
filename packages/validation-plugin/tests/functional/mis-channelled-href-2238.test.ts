import { createRouter } from "@real-router/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { validationPlugin } from "../../src";

import type { Route, Router } from "@real-router/core";

/**
 * A declared QUERY name handed in the PATH bag is reported at the doors that
 * PRINT or JUDGE, and nowhere else (#2238).
 *
 * ⚑ **The committing doors already answer, which is why this is only about the
 * two that do not.** `navigate` throws `WRONG_CHANNEL` on the same bag and
 * `canNavigateTo` answers `false`; `buildPath` prints an href missing the key and
 * `isActiveRoute` answers about the location that href describes. Both of those
 * are correct for their own question and both are silent, so the caller learns
 * nothing until something clicks — and a ⌘-click, a copied link or SSR markup
 * never does.
 *
 * ⚠ **A warning, not a throw.** These are render-path doors: `buildPath` returns
 * a string and `isActiveRoute` a boolean, so neither has an error channel, and
 * #2124 measured that wiring core's guard here changes an ANSWER rather than
 * revealing a silence — it reddens the location-predicate pin in core's
 * `utils.test.ts` and re-opens #1978.
 *
 * ⚠ **The spelling is RETIRED, not invalid.** `withholdFilledSlots` handles it as
 * a precedence rule (`channels/CLAUDE.md`), so this reports a deprecation rather
 * than a rejection.
 */
const ROUTES: readonly Route[] = [
  { name: "u", path: "/u/:id?tab" },
  { name: "d", path: "/d?page", defaultSearch: { page: "1" } },
  { name: "coll", path: "/c/:id?id" },
  { name: "plain", path: "/plain" },
  { name: "home", path: "/" },
];

/** Warning lines naming `needle`, flattened across the logger's arguments. */
function reportedFor(
  warn: { mock: { calls: unknown[][] } },
  needle: string,
): string[] {
  return warn.mock.calls
    .map((call) => call.map(String).join(" "))
    .filter((line) => line.includes(needle));
}

function withPlugin(): Router {
  const router = createRouter([...ROUTES]);

  router.usePlugin(validationPlugin());

  return router;
}

describe("a declared query name handed in the path bag (#2238)", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("reports it at buildPath, naming the route and the key", () => {
    const router = withPlugin();

    expect(router.buildPath("u", { id: "7", tab: "x" })).toBe("/u/7");
    expect(reportedFor(warn, "tab")).toHaveLength(1);
  });

  it("reports it at isActiveRoute, which answers about the same href", async () => {
    const router = withPlugin();

    await router.start("/u/7?tab=x");

    expect(router.isActiveRoute("u", { id: "7", tab: "x" })).toBe(true);
    expect(reportedFor(warn, "tab")).toHaveLength(1);

    router.stop();
  });

  it("warns ONCE per route + key, however many doors see it", async () => {
    // The de-dup that makes this affordable on a render path: a page with a
    // hundred identical <Link>s raises one line, not a hundred.
    const router = withPlugin();

    await router.start("/u/7?tab=x");

    router.buildPath("u", { id: "7", tab: "x" });
    router.buildPath("u", { id: "9", tab: "y" });
    router.isActiveRoute("u", { id: "7", tab: "x" });

    expect(reportedFor(warn, "tab")).toHaveLength(1);

    router.stop();
  });

  it("names the DEFAULTED case, where the href loses both values", () => {
    // `page` carries a route default, so `withholdFilledSlots` declines it and
    // the href carries neither the caller's `2` nor the route's `1`. The controls
    // are what make that readable as the retired spelling rather than a broken
    // fixture.
    const router = withPlugin();

    expect(router.buildPath("d", {})).toBe("/d?page=1");
    expect(router.buildPath("d", {}, { page: "2" })).toBe("/d?page=2");
    expect(warn).not.toHaveBeenCalled();

    expect(router.buildPath("d", { page: "2" })).toBe("/d");
    expect(reportedFor(warn, "page")).toHaveLength(1);
  });

  it("says nothing when the caller is channel-correct", async () => {
    const router = withPlugin();

    await router.start("/");

    router.buildPath("u", { id: "7" }, { tab: "x" });
    router.buildPath("plain");
    router.buildPath("u", { id: "7", tab: undefined });
    router.isActiveRoute("u", { id: "7" }, { tab: "x" });

    expect(warn).not.toHaveBeenCalled();

    router.stop();
  });

  it("says nothing for the /items/:id?id carve-out, which is path-owned", () => {
    // #843 / #1549: a name that also occupies a path slot is absent from
    // `queryNames` by construction, so `id` in the path bag is the CORRECT
    // spelling here. Without this cell a predicate keyed on the raw declaration
    // list would look right and report a legitimate call.
    const router = withPlugin();

    expect(router.buildPath("coll", { id: "7" })).toBe("/c/7");
    expect(warn).not.toHaveBeenCalled();
  });

  it("CONTROL — bare core stays silent, the diagnostic is the plugin's", () => {
    const bare = createRouter([...ROUTES]);

    expect(bare.buildPath("u", { id: "7", tab: "x" })).toBe("/u/7");
    expect(warn).not.toHaveBeenCalled();
  });
});
