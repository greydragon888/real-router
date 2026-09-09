import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

/**
 * `getAdoptedOrigins` hands back a CACHED record, so it must hand back a frozen
 * one (#2195).
 *
 * ⚑ The rule is #1805's **cached ⟹ frozen**, and `packages/core/CLAUDE.md`
 * "Frozen factory surfaces" states it. Not restated here: it would be a second
 * home to keep true.
 *
 * ⚠ **It is NOT the only cached-and-unfrozen handout**, and saying so would be
 * an absolute placed without recounting the set. Asked of all 32
 * `getInternals` members rather than of a tabulated four, SIX hand back a
 * cached object and FOUR of those were unfrozen:
 *
 * | member                 | cached | frozen before | what it is |
 * | ---------------------- | ------ | ------------- | ---------- |
 * | `getAdoptedOrigins`    | yes    | no ← this fix | a record built once |
 * | `dependenciesGetStore` | yes    | no            | a live store |
 * | `port`                 | yes    | no            | a live store |
 * | `routeGetStore`        | yes    | no            | a live store |
 * | `getOptions`           | yes    | yes           | — |
 * | `getTree`              | yes    | yes           | — |
 * | `getCloneState`        | no — a fresh literal per call | n/a | — |
 *
 * The other three are what the `internals` carve-out in
 * `handed-out-containers-1957` was written for — "the handle exists to hand out
 * core's live stores" — and core keeps reading them. This one is not a store:
 * `git grep '#adoptedOrigins'` returns exactly three sites, all in `Router.ts`
 * — the field declaration, the single write in the constructor, and the read in
 * the `registerInternals` closure. It is an immutable record built once for a
 * consumer to read, so the carve-out's reason does not reach it. That
 * difference is checkable rather than arguable, and it is what this fix turns
 * on.
 *
 * ⚠ What the write COST is silence, which is why the cells assert the report
 * rather than only the freeze. `DefaultsMutationWatch.watch` skips a slot whose
 * origin is `undefined`, so a single assignment left the #2148 diagnostic
 * permanently unable to fire — for that router and for every consumer of it —
 * with nothing thrown and nothing logged.
 */
describe("#2195 — the adopted-origins handout is frozen", () => {
  const ROUTES = [
    { name: "h", path: "/h" },
    { name: "other", path: "/other" },
  ];

  const build = () => {
    const defaultParams: Record<string, unknown> = { id: "1" };
    const router = createRouter(
      ROUTES as never,
      {
        defaultRoute: "h",
        defaultParams,
      } as never,
    );

    return { router, defaultParams };
  };

  it("hands back the same object on every call", () => {
    const { router } = build();
    const internals = getInternals(router);

    expect(internals.getAdoptedOrigins()).toBe(internals.getAdoptedOrigins());
  });

  it("hands back a frozen object", () => {
    const { router } = build();

    expect(Object.isFrozen(getInternals(router).getAdoptedOrigins())).toBe(
      true,
    );
  });

  it("refuses a write into the slot the diagnostic reads", () => {
    const { router } = build();
    const handout = getInternals(router).getAdoptedOrigins() as Record<
      string,
      unknown
    >;

    expect(() => {
      handout.defaultParams = undefined;
    }).toThrow(TypeError);

    expect(
      getInternals(router).getAdoptedOrigins().defaultParams,
    ).toBeDefined();
  });

  it("refuses a write that ADDS a slot as well as one that clears it", () => {
    const { router } = build();
    const handout = getInternals(router).getAdoptedOrigins() as Record<
      string,
      unknown
    >;

    expect(() => {
      handout.defaultSearch = new WeakRef({});
    }).toThrow(TypeError);

    expect(
      getInternals(router).getAdoptedOrigins().defaultSearch,
    ).toBeUndefined();
  });

  it("keeps the origin the watch resolves — freezing the record, not the bag", () => {
    const { router, defaultParams } = build();

    expect(
      getInternals(router).getAdoptedOrigins().defaultParams?.deref(),
    ).toBe(defaultParams);
    expect(Object.isFrozen(defaultParams)).toBe(false);
  });

  it("control · a router with no watchable bag still hands back a frozen record", () => {
    const router = createRouter(ROUTES as never, {
      defaultRoute: "h",
    });
    const handout = getInternals(router).getAdoptedOrigins();

    expect(handout).toStrictEqual({});
    expect(Object.isFrozen(handout)).toBe(true);
  });
});
