import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Route } from "@real-router/core/types";

/**
 * The pipeline terminal reads the route name ONCE (#1883).
 *
 * `canonicalize` is the sole producer of `Canonical`, and it took the caller's
 * `name` through untouched — so every consumer of `canonical.name` coerced it
 * again, and a State could be published whose `name` is the caller's OBJECT
 * while its `params` are the coerced route's `defaultParams`. One value naming
 * two different things, which is the `ARCHITECTURE.md` criterion's "an object
 * whose own fields disagree" verbatim.
 *
 * ⚑ A COERCION, not a gate, and the distinction is the repo's own: #1881 gated
 * three doors and #1897 reverted them, because a gate is earned only where a
 * STABLY-coercing non-string already does damage. Coercing removes the damage
 * instead — the fields agree afterwards — so the gate stops being earned. The
 * three doors that decision protects are pinned below as UNCHANGED.
 *
 * ⚑ It also closes what #1889 declared open at the sibling door: `buildPath`
 * used to throw about a route that EXISTS, and to split its encoder read from
 * its matcher read. With one read there is no second answer to disagree with.
 */
describe("the pipeline terminal reads the name once (#1883)", () => {
  const ROUTES = (): Route[] =>
    [
      { name: "home", path: "/home", defaultParams: { who: "HOME" } },
      { name: "other", path: "/other", defaultParams: { who: "OTHER" } },
      { name: "A", path: "/a/:id", encodeParams: (p: unknown) => p },
    ] as unknown as Route[];

  const reads: string[] = [];

  const drifting = (answers: readonly string[]): string => {
    let n = 0;

    return {
      toString() {
        const out = answers[Math.min(n, answers.length - 1)];

        n += 1;
        reads.push(out);

        return out;
      },
    } as unknown as string;
  };

  it("makeState returns a State whose name is a STRING, and whose fields agree", () => {
    // Measured before the fix: 2 coercions, `name` IS the caller's object while
    // `params` are `home`'s defaults — the control below shows the defaults
    // really are the answer, so the two halves named different things.
    const router = createRouter(ROUTES());

    reads.length = 0;

    const state = getPluginApi(router).makeState(
      drifting(["home"]),
      {},
      {},
      "/x",
    );

    expect(typeof state.name).toBe("string");
    expect(state.name).toBe("home");
    expect(state.params).toStrictEqual({ who: "HOME" });
    expect(reads).toHaveLength(1);

    router.dispose();
  });

  it("makeState answers as its FIRST read names, under a drift", () => {
    const router = createRouter(ROUTES());

    reads.length = 0;

    const state = getPluginApi(router).makeState(
      drifting(["home", "other"]),
      {},
      {},
      "/x",
    );

    expect(state.name).toBe("home");
    expect(state.params).toStrictEqual({ who: "HOME" });

    router.dispose();
  });

  it("makeState without a path no longer throws about a route that EXISTS", () => {
    // Measured before the fix: 4 coercions and
    // `[SegmentMatcher.buildPath] 'home' is not defined` — about `home`.
    const router = createRouter(ROUTES());

    reads.length = 0;

    const state = getPluginApi(router).makeState(drifting(["home"]), {}, {});

    expect(state.name).toBe("home");
    expect(state.path).toBe("/home");

    router.dispose();
  });

  it("buildPath answers instead of throwing, and stops splitting its reads", () => {
    // #1889 closed the `typeof`/invoke split and DECLARED two residues open: the
    // caller's `encodeParams` ran before a refusal that was already guaranteed,
    // and a drift could still split the encoder read from the matcher read. One
    // read closes both — there is no second answer left to disagree with.
    const router = createRouter(ROUTES());

    reads.length = 0;

    expect(router.buildPath(drifting(["A"]), { id: "1" })).toBe("/a/1");
    expect(reads).toHaveLength(1);

    reads.length = 0;

    expect(
      router.buildPath(drifting(["A", "home", "home"]), { id: "1" }),
      "a drift builds what its FIRST read named",
    ).toBe("/a/1");

    router.dispose();
  });

  it("CONTROL — the three doors #1881 protects are UNCHANGED", async () => {
    // ⚠ This is the boundary, and it is why the fix is a coercion rather than a
    // gate. `packages/core/ARCHITECTURE.md` "Route-Name Type Gates" says these
    // carry no type predicate and none may be re-introduced. A gate at this
    // terminal would have turned `isActiveRoute`'s `true` into `false`;
    // measured, the coercion changes none of the three.
    const router = createRouter([
      { name: "plain", path: "/plain" },
      { name: "fwd", path: "/fwd", forwardTo: "one" },
      { name: "fwd2", path: "/fwd2", forwardTo: "two" },
      { name: "one", path: "/one" },
      { name: "two", path: "/two" },
    ]);

    await router.start("/two");

    reads.length = 0;

    expect(router.isActiveRoute(drifting(["fwd2"]))).toBe(true);
    // The ANSWER is this cell's subject — the count is here to show the reads
    // are the arm's own, above this terminal, rather than this terminal's.
    // Eight since #1946: the forward gate asked `hasOwn` of the name twice and
    // now binds one key for both lookups.
    expect(
      reads,
      "still the forwardTo arm's own reads, above this terminal",
    ).toHaveLength(8);

    reads.length = 0;

    expect(router.canNavigateTo(drifting(["fwd"]))).toBe(false);
    expect(reads, "refuses on a Map miss, before the terminal").toHaveLength(0);

    reads.length = 0;

    await expect(router.navigate(drifting(["fwd"]))).rejects.toThrow();
    expect(reads).toHaveLength(0);

    router.dispose();
  });

  it("CONTROL — a string caller is unaffected everywhere", () => {
    const router = createRouter(ROUTES());
    const api = getPluginApi(router);

    expect(router.buildPath("A", { id: "1" })).toBe("/a/1");
    expect(api.makeState("home", {}, {}, "/x").name).toBe("home");
    expect(api.makeState("home", {}, {}).path).toBe("/home");
    expect(() => router.buildPath("nope")).toThrow();

    router.dispose();
  });
});
