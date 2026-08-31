// packages/core/tests/functional/routes/is-active-route-name-throw-1946.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRouter } from "@real-router/core";

import type { LogCallback, Router } from "@real-router/core/types";

/**
 * `isActiveRoute` answers, it never throws into a render (#1577, #1946).
 *
 * The operand swept here is the NAME. It is typed `string`, but a caller may
 * hand core an object whose `toString` is application code — and core reads that
 * name several times on the way through, so "does the predicate survive?"
 * depends on WHICH read throws.
 *
 * ⚠ A single-position cell is not enough, and neither is a single ARM. Measured
 * on the base commit, the escape window differs per arm: N = 0…3 on a static
 * forwarding tree, N = 0…6 once a dynamic `forwardTo` puts a second handler on
 * the path. A cell pinned to one N, or to one arm, goes green on a half-fix.
 */

/** A name whose `toString` answers `value` for `okReads` reads, then throws. */
function nameThrowingAfter(okReads: number, value: string): string {
  let reads = 0;

  return {
    toString() {
      reads += 1;

      if (reads > okReads) {
        throw new Error("BOOM");
      }

      return value;
    },
  } as unknown as string;
}

const SWEEP = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;

describe("isActiveRoute — a throwing route name never reaches the render (#1946)", () => {
  let logged: ReturnType<typeof vi.fn<LogCallback>>;

  beforeEach(() => {
    logged = vi.fn<LogCallback>();
  });

  const start = async (
    routes: Parameters<typeof createRouter>[0],
  ): Promise<Router> => {
    const router = createRouter(routes, {
      logger: { level: "all", callback: logged },
    });

    await router.start("/home");

    return router;
  };

  const STATIC_ROUTES = [
    { name: "home", path: "/home" },
    { name: "fwd", path: "/fwd", forwardTo: "home" },
  ];

  const DYNAMIC_ROUTES = [
    { name: "home", path: "/home" },
    {
      name: "dyn",
      path: "/dyn",
      forwardTo: (): string => {
        throw new Error("FWD-BOOM");
      },
    },
  ];

  // The two `it.each` below are vacuity-capable: emptied, they register zero
  // cells in silence and the file still exits 0. Counted here, outside the
  // `each`, per `table-vacuity-authority`.
  it("the sweep covers every read position", () => {
    expect(SWEEP).toHaveLength(9);
  });

  it.each(SWEEP)(
    "forward-map arm: a name throwing after read %i answers false",
    async (n) => {
      const router = await start(STATIC_ROUTES);

      expect(() =>
        router.isActiveRoute(nameThrowingAfter(n, "home")),
      ).not.toThrow();
      expect(router.isActiveRoute(nameThrowingAfter(n, "home"))).toBe(false);

      router.dispose();
    },
  );

  it.each(SWEEP)(
    "dynamic forwardTo arm: a name throwing after read %i answers false",
    async (n) => {
      const router = await start(DYNAMIC_ROUTES);

      expect(() =>
        router.isActiveRoute(nameThrowingAfter(n, "dyn")),
      ).not.toThrow();
      expect(router.isActiveRoute(nameThrowingAfter(n, "dyn"))).toBe(false);

      router.dispose();
    },
  );

  it("the honest false is logged, not swallowed", async () => {
    const router = await start(DYNAMIC_ROUTES);

    expect(router.isActiveRoute(nameThrowingAfter(0, "dyn"))).toBe(false);
    expect(logged).toHaveBeenCalledWith(
      "warn",
      "router.isActiveRoute",
      expect.stringContaining("treating the link as inactive"),
      expect.anything(),
    );

    router.dispose();
  });

  // CONTROL — without these the sweep above is satisfied by a predicate that
  // answers `false` unconditionally.
  it("CONTROL: a plain string name still answers", async () => {
    const router = await start(STATIC_ROUTES);

    expect(router.isActiveRoute("home")).toBe(true);
    expect(router.isActiveRoute("fwd")).toBe(true);

    router.dispose();
  });

  it("CONTROL: a stable non-string name still answers true", async () => {
    const router = await start(STATIC_ROUTES);

    expect(
      router.isActiveRoute({ toString: () => "fwd" } as unknown as string),
    ).toBe(true);

    router.dispose();
  });

  it("CONTROL: a throwing dynamic forwardTo answers false for a string name", async () => {
    const router = await start(DYNAMIC_ROUTES);

    expect(router.isActiveRoute("dyn")).toBe(false);

    router.dispose();
  });
});
