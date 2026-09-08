import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";

/**
 * A `forwardTo` CALLBACK decides from the same read of the params bag that ships
 * (#2143).
 *
 * The seam hands the chain the caller's bag: the callback reads it to pick a
 * target, and `#layerChainDefaults` reads it again to build the params that
 * become the URL. Two reads, one bag, and the bag is the application's — so a
 * value that answers differently between them chose one destination and printed
 * another.
 *
 * ⚑ Only the FORWARDING branches copy, and that is the measurement #2134 left
 * behind: on a route that does not forward, core reads the bag zero times
 * through this seam and hands the container straight back by identity —
 * `handed-out-containers-1957` pins that, and the control below re-states it, so
 * the copy cannot quietly spread to the route shape that has no reader at all.
 */
describe("a forwardTo callback and the URL read the bag once (#2143)", () => {
  const ROUTES = [
    {
      name: "src",
      path: "/src/:id",
      forwardTo: (_dep: unknown, params: Record<string, unknown>): string => {
        seen.push(String(params.id));

        return "dst";
      },
    },
    { name: "dst", path: "/dst/:id" },
    { name: "plain", path: "/plain/:id" },
    // The SECOND forwarding branch: a static hop whose target then forwards
    // dynamically. It layers the chain through a different call site, and a
    // mutant that reverted only that site left the cells above green.
    { name: "entry", path: "/entry/:id", forwardTo: "hop" },
    {
      name: "hop",
      path: "/hop/:id",
      forwardTo: (_dep: unknown, params: Record<string, unknown>): string => {
        seen.push(String(params.id));

        return "dst";
      },
    },
  ];

  const seen: string[] = [];

  /** `id` answers `"1"` once and `"999"` for every read after it. */
  const drifting = (counter: { n: number }): Record<string, unknown> =>
    new Proxy(
      { id: "1" },
      {
        get(target, key, receiver): unknown {
          if (key === "id") {
            counter.n += 1;

            return counter.n === 1 ? "1" : "999";
          }

          return Reflect.get(target, key, receiver) as unknown;
        },
      },
    );

  const make = (): Router => {
    seen.length = 0;

    return createRouter(ROUTES as never, {});
  };

  it("the plugin seam ships the params the callback saw", () => {
    const router = make();
    const counter = { n: 0 };
    const forwarded = getPluginApi(router).forwardState(
      "src",
      drifting(counter) as never,
    );

    expect({
      seenByCallback: seen,
      shipped: { ...(forwarded.params as Record<string, unknown>) },
      reads: counter.n,
    }).toStrictEqual({
      seenByCallback: ["1"],
      shipped: { id: "1" },
      reads: 1,
    });

    router.dispose();
  });

  it("the static-prefix branch layers over the same read", () => {
    // ⚠ `forwardState` reaches `#layerChainDefaults` from THREE places, and two
    // of them consult a callback. Reverting the other one alone left every cell
    // in this file green — measured, so this is not symmetry for its own sake.
    const router = make();
    const counter = { n: 0 };
    const forwarded = getPluginApi(router).forwardState(
      "entry",
      drifting(counter) as never,
    );

    expect({
      seenByCallback: seen,
      target: forwarded.name,
      shipped: { ...(forwarded.params as Record<string, unknown>) },
      reads: counter.n,
    }).toStrictEqual({
      seenByCallback: ["1"],
      target: "dst",
      shipped: { id: "1" },
      reads: 1,
    });

    router.dispose();
  });

  it("isActiveRoute answers about the destination the callback chose", async () => {
    // The render-path arm, and the sharper one: the predicate resolved the link
    // to `/dst/1` through the callback and then compared the ACTIVE state
    // against a second read, so a `<Link>` pointing exactly where the user
    // already is reported itself inactive.
    const router = make();

    await router.start("/dst/1");

    const counter = { n: 0 };
    const active = router.isActiveRoute("src", drifting(counter) as never);

    expect({ seenByCallback: seen, active, reads: counter.n }).toStrictEqual({
      seenByCallback: ["1"],
      active: true,
      reads: 1,
    });

    router.dispose();
  });

  it("CONTROL — navigate was already closed at the entry door (#2134)", async () => {
    // Not a cell about this fix: it pins that the façade door's own adoption
    // still stands, so a later round cannot "simplify" the copy above by
    // arguing the entry already made one — it does not, for the seam.
    const router = make();

    await router.start("/dst/0");

    const counter = { n: 0 };
    const state = await router.navigate("src", drifting(counter) as never);

    expect({
      path: (state as { path: string }).path,
      reads: counter.n,
    }).toStrictEqual({
      path: "/dst/1",
      reads: 1,
    });

    router.dispose();
  });

  it("CONTROL — a route that does not forward still gets its own bag back", () => {
    // The identity `handed-out-containers-1957` pins. Core reads this bag zero
    // times through the seam on a non-forwarding route, so there is nothing to
    // judge and nothing to ship — and a copy here would trade a pinned identity
    // for no read at all.
    const router = make();
    const bag = { id: "7" };
    const forwarded = getPluginApi(router).forwardState("plain", bag as never);

    expect({
      sameObject: forwarded.params === bag,
      name: forwarded.name,
    }).toStrictEqual({ sameObject: true, name: "plain" });

    router.dispose();
  });
});
