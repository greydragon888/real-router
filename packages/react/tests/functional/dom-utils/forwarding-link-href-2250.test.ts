import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect, it, vi } from "vitest";

import { buildHref, navigateWithHash } from "../../../src/dom-utils/link-utils";

import type { Route, Router } from "@real-router/core";

/**
 * The href a `<Link>` renders is where its click goes, `forwardTo` included
 * (#2250 · INVARIANTS `buildPath / matchPath` #7).
 *
 * ⚑ **The door, not the builder.** `router.buildPath` is class LITERAL by record
 * — INVARIANTS #8 gives it a beneficiary, "a plugin can build a state for an alias
 * without being teleported off it" — so it answers about the route it was NAMED
 * and that is not the defect. An href is a promise about where the click lands,
 * so the adapter must ask a door in class ①.
 *
 * ⚠ **Two doors reach the href, and this file owns the FALLBACK one.** `buildHref`
 * prefers `router.buildUrl` — supplied by all three URL plugins from
 * `createPluginBuildUrl` — and only reaches `router.buildPath` when no such plugin
 * is installed. A fix landing here alone is green and dead in production, so the
 * other arm is pinned where its code lives:
 * `packages/browser-plugin/tests/functional/browser-env/forwarding-build-url-2250.test.ts`.
 *
 * ⚠ **The active arm stays LITERAL and this file pins that it does.** Measured:
 * after the click `isActiveRoute("old", …)` answers `true` about the route the
 * caller named, which is what keeps the link highlighted. Resolving it too would
 * re-open #1978.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/home" },
  { name: "old", path: "/old/:id", forwardTo: "fresh" },
  { name: "fresh", path: "/fresh/:id?tab", defaultSearch: { tab: "a" } },
  { name: "plain", path: "/plain/:id" },
];

const PARAMS = { id: "1" };

async function started(): Promise<Router> {
  const router = createRouter([...ROUTES]);

  await router.start("/home");

  return router;
}

/** The href this intent renders, and the path the same intent commits. */
async function bothDoors(
  router: Router,
  name: string,
): Promise<{ href: string | undefined; destination: string }> {
  const href = buildHref(router, name, PARAMS);
  const committed = await navigateWithHash(
    router,
    name,
    PARAMS,
    undefined,
    undefined,
    {},
  );

  return { href, destination: committed.path };
}

describe("a <Link> to a forwarding route (#2250)", () => {
  it("renders the href its own click commits — no URL plugin installed", async () => {
    const router = await started();

    const { href, destination } = await bothDoors(router, "old");

    expect(href).toBe(destination);
    expect(href).toBe("/fresh/1?tab=a");

    router.stop();
  });

  it("CONTROL — a non-forwarding route already agreed, and still does", async () => {
    // Without this cell the two above would pass on a `buildHref` that always
    // resolved through `navigate`, which would be a different function.
    const router = await started();

    const { href, destination } = await bothDoors(router, "plain");

    expect(href).toBe(destination);
    expect(href).toBe("/plain/1");

    router.stop();
  });

  it("CONTROL — the active arm keeps answering about the route the caller NAMED", async () => {
    const router = await started();

    await navigateWithHash(router, "old", PARAMS, undefined, undefined, {});

    expect(router.getState()?.name).toBe("fresh");
    expect(router.isActiveRoute("old", PARAMS)).toBe(true);

    router.stop();
  });

  it("CONTROL — a router the registry does not hold keeps the literal door", () => {
    // `getPluginApi` keys on identity through a WeakMap and REFUSES anything
    // else. Without the inner `try` in `buildHref`, every href on a test double
    // or a `Proxy` wrapper becomes `undefined` plus a "route is not defined"
    // error — measured on this package's own `link-utils.test.ts`, which builds
    // its routers as `{ buildPath: vi.fn() }`.
    const stub = {
      buildPath: vi.fn(() => "/literal"),
    } as unknown as Router;

    expect(buildHref(stub, "old", PARAMS)).toBe("/literal");
    expect(stub.buildPath).toHaveBeenCalledWith("old", PARAMS, undefined);
  });

  it("CONTROL — buildPath itself stays LITERAL, its capability intact", async () => {
    // INVARIANTS #8: the literal form is why a plugin can build a state for an
    // alias without being teleported off it. The fix must not reach this door.
    const router = await started();

    expect(router.buildPath("old", PARAMS)).toBe("/old/1");
    expect(getPluginApi(router).makeState("old", PARAMS).name).toBe("old");

    router.stop();
  });
});
