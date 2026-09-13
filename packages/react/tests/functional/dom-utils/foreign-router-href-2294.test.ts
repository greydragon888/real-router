import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildHref } from "../../../src/dom-utils/link-utils";

import type { Route, Router } from "@real-router/core";

/**
 * A `<Link>` whose router core cannot read renders the LITERAL route, and until
 * #2294 it did so in silence (#2294).
 *
 * ⚑ **The silence is correct for one of the two refusals and wrong for the
 * other.** `buildHref` takes a `Router`-SHAPED object, not necessarily a
 * registered one, so a test double must keep the literal path with no noise —
 * `forwarding-link-href-2250.test.ts` owns that control. A REAL router that
 * this copy of core cannot find is a different thing entirely: the href silently
 * stops resolving `forwardTo`, which is exactly the defect #2250 closed, and the
 * developer is told nothing.
 *
 * ⚠ **The href still renders.** Dropping it would trade a wrong destination for
 * no destination, and the outer `catch` already owns the cases where nothing can
 * be built. What changes is that the developer hears about it — the same shape
 * this file's neighbours take for an empty path and an unknown route.
 *
 * ⚠ **A transparent `Proxy` is the reachable form, not a contrivance.**
 * `packages/vue/CLAUDE.md` documents `reactive()` / Pinia wrapping the router
 * and names the remedy; the proxy forwards the brand read, so it is a real
 * router by every question core can ask except the WeakMap.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/" },
  { name: "old", path: "/old", forwardTo: "fresh" },
  { name: "fresh", path: "/fresh" },
];

async function started(): Promise<Router> {
  const router = createRouter([...ROUTES]);

  await router.start("/");

  return router;
}

describe("a <Link> whose router core cannot read (#2294)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("says so, and still renders the literal href", async () => {
    const router = await started();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const href = buildHref(new Proxy(router, {}), "old", {});

    expect(href, "the destination still renders").toBe("/old");
    expect(spy, "and the developer is told").toHaveBeenCalledTimes(1);
    expect(
      spy.mock.calls[0]?.[0],
      "naming the two reachable causes, so it is actionable",
    ).toMatch(/proxy|copies of/i);

    router.stop();
  });

  it("CONTROL — a Router-SHAPED double stays silent, as its contract says", async () => {
    // The pinned case: `buildHref` accepts an unregistered shape on purpose, and
    // warning there would fire on every render of every stub-router test.
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const stub = { buildPath: () => "/old" } as unknown as Router;

    expect(buildHref(stub, "old", {})).toBe("/old");
    expect(spy, "silence is the contract here").not.toHaveBeenCalled();
  });

  it("a router whose read THROWS is not reported — it cannot be told apart", async () => {
    // ⚠ The #1572 class: a diagnostic that reads the caller's object can itself
    // throw, and then the error comes FROM the diagnostic. A `Proxy` whose `get`
    // trap throws is the reachable form, so the read answers "cannot tell" and
    // the arm falls back exactly as it does for a plain double.
    const router = await started();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Throws for the BRAND only: a trap that threw for everything would blow up
    // in the `buildUrl` read one block above and never reach the diagnostic,
    // which is a different cell and not this one.
    const hostile = new Proxy(router, {
      get(target, key, receiver) {
        if (key === Symbol.for("real-router.router")) {
          throw new Error("hostile get trap");
        }

        return Reflect.get(target, key, receiver) as unknown;
      },
    });

    expect(() => buildHref(hostile, "old", {})).not.toThrow();
    expect(
      spy,
      "no claim is made about a router that cannot be read",
    ).not.toHaveBeenCalledWith(expect.stringMatching(/copies of/i));

    router.stop();
  });

  it("CONTROL — a registered router resolves and says nothing", async () => {
    // Without this the cells above hold equally for a `buildHref` that warned on
    // everything, or that never resolved at all.
    const router = await started();
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(buildHref(router, "old", {})).toBe("/fresh");
    expect(spy).not.toHaveBeenCalled();

    router.stop();
  });
});
