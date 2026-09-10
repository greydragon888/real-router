import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { createRequestScope } from "@real-router/ssr-utils";

import type { Route } from "@real-router/core";

/**
 * A scoped router answers like the base it was cloned from (#1893).
 *
 * ⚑ **This package's contract, asserted in this package.** `createRequestScope`
 * calls `cloneRouter` and does nothing else to routes, so whatever a clone gets
 * wrong it gets wrong once per request. The rest of the suite covers the scope's
 * OWN concerns — deps, abort signal, close-listener lifetime, error paths — and
 * none of it asks what the cloned router answers.
 *
 * ⚠ **The fixture must carry a FORWARDING route or the tier is vacuous.** The
 * shape this exists for is #1800: `cloneRouter` copied the forward map without
 * the derived `hasAnyForward` gate, so every clone answered `isActiveRoute`
 * `false` for every forwarding route and a `<Link to="alias">` rendered without
 * its active class in the server HTML. The flag starts `false` on a fresh clone,
 * and a forward-free tree is SUPPOSED to leave it `false` — so such a tree passes
 * with the defect fully present. `EXPECTED_ACTIVE` therefore carries literal
 * values rather than base-vs-scope agreement alone, and the control below
 * asserts that a forwarding row among them is `true`.
 *
 * ⚠ **Static and dynamic forwards are separate rows on purpose.** The gate is
 * derived from two maps; a static-only fixture exercises one of them.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/home" },
  { name: "static-alias", path: "/static-alias", forwardTo: "target" },
  { name: "dynamic-alias", path: "/dynamic-alias", forwardTo: () => "target" },
  {
    name: "target",
    path: "/target",
    children: [{ name: "child", path: "/child" }],
  },
  { name: "plain", path: "/plain" },
];

/** Committed at `/target/child` — the URL every cell below is measured against. */
const START = "/target/child";

/** `[route, isActiveRoute at START]`. The two forwarding rows are the #1800 shape. */
const EXPECTED_ACTIVE: readonly (readonly [string, boolean])[] = [
  ["home", false],
  ["static-alias", true],
  ["dynamic-alias", true],
  ["target", true],
  ["target.child", true],
  ["plain", false],
];

/** Names whose `buildPath` must agree; the forwards are the ones that can drift. */
const BUILT: readonly string[] = ["static-alias", "dynamic-alias", "target"];

/** Rows a clone answers `false` for under #1800 while the base answers `true`. */
const FORWARDING = new Set(["static-alias", "dynamic-alias"]);

async function scopedRouter(): Promise<{
  base: ReturnType<typeof createRouter>;
  scoped: ReturnType<typeof createRouter>;
  dispose: () => PromiseLike<void>;
}> {
  const base = createRouter([...ROUTES]);

  await base.start(START);

  const scope = createRequestScope(new Request("https://example.test/"), base);

  await scope.router.start(START);

  return {
    base,
    scoped: scope.router,
    dispose: () => scope[Symbol.asyncDispose](),
  };
}

describe("a request scope's router answers like its base (#1893)", () => {
  it("CONTROL — the table registers its cells, and a FORWARDING row is true", () => {
    // `it.each([])` registers nothing in silence, so the count lives outside the
    // `each`. The second assertion is the anti-vacuity one this tier exists for:
    // with #1800 present every forwarding row reads `false` on the clone, so a
    // table whose forwarding rows expected `false` would pass with the bug in.
    expect(EXPECTED_ACTIVE).toHaveLength(6);
    expect(
      EXPECTED_ACTIVE.filter(
        ([name, active]) => FORWARDING.has(name) && active,
      ),
    ).toHaveLength(2);
  });

  it.each(EXPECTED_ACTIVE)(
    "answers isActiveRoute(%s) the same as the base, and answers %s",
    async (name, active) => {
      const { base, scoped, dispose } = await scopedRouter();

      expect(base.isActiveRoute(name)).toBe(active);
      expect(scoped.isActiveRoute(name)).toBe(active);

      await dispose();
    },
  );

  it.each(BUILT)("builds %s to the same path as the base", async (name) => {
    const { base, scoped, dispose } = await scopedRouter();

    expect(scoped.buildPath(name)).toBe(base.buildPath(name));

    await dispose();
  });

  it("commits the same state name as the base", async () => {
    const { base, scoped, dispose } = await scopedRouter();

    expect(scoped.getState()?.name).toBe(base.getState()?.name);
    expect(scoped.getState()?.name).toBe("target.child");

    await dispose();
  });

  it("two scopes off one base are independent, and neither reaches the base", async () => {
    // The other half of the per-request contract: a request that edits its own
    // route table must not be visible to a concurrent request or to the server's
    // long-lived base router.
    const base = createRouter([...ROUTES]);

    await base.start(START);

    const first = createRequestScope(
      new Request("https://example.test/1"),
      base,
    );
    const second = createRequestScope(
      new Request("https://example.test/2"),
      base,
    );

    getRoutesApi(first.router).add({ name: "only-in-first", path: "/only" });

    expect(first.router.buildPath("only-in-first")).toBe("/only");
    expect(() => second.router.buildPath("only-in-first")).toThrow();
    expect(() => base.buildPath("only-in-first")).toThrow();

    await first[Symbol.asyncDispose]();
    await second[Symbol.asyncDispose]();
  });
});
