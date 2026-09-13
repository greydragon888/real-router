import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { buildHref } from "../../../src/dom-utils/link-utils";

import type { Params, Route, SearchParams } from "@real-router/core";

/**
 * One href is ONE operation, so a plugin's `forwardState` interceptor runs once
 * for it (#2260).
 *
 * ⚑ **Counted, not read.** `buildHref` resolves first and prints second, and
 * since #2257 BOTH halves reached the seam: the explicit `forwardState` call,
 * then `router.buildPath`, which runs the same chain one door lower (#2087).
 * Nothing in the source says "twice" — the second pass is a consequence of two
 * doors each being correct on their own — so the only way to see it is to count.
 *
 * ⚠ **This is a CONTRACT cell before it is a cost cell.** A plugin author
 * registers one interceptor and has no reason to expect two invocations per
 * href; a stateful one (a counter, a cache warmer, a logger) double-counts. The
 * measured cost — +1333 ns per href with `search-schema` + `persistent-params`
 * installed — is what makes it worth fixing now rather than the reason it is
 * wrong.
 *
 * ⚠ **Idempotence is why the SECOND pass was invisible.** Both first-party seam
 * plugins are idempotent, so one pass and two printed the same href on every
 * route shape measured, with the plugins installed and without. The href cells
 * below therefore cannot fail for the defect this file is about — they are here
 * to pin that the repair did not change the ANSWER, and the count cells are the
 * ones that carry it.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/home" },
  { name: "old", path: "/old/:id", forwardTo: "fresh" },
  { name: "fresh", path: "/fresh/:id?tab", defaultSearch: { tab: "a" } },
  { name: "plain", path: "/plain/:id?tab" },
];

const PARAMS = { id: "1" };

interface Counted {
  readonly passes: number;
  readonly href: string | undefined;
}

/** One `buildHref`, with the chain a plugin registers counted around it. */
async function countedHref(
  routeName: string,
  params: Params = PARAMS,
  search?: SearchParams,
): Promise<Counted> {
  const router = createRouter([...ROUTES]);

  await router.start("/home");

  const api = getPluginApi(router);
  let passes = 0;

  const remove = api.addInterceptor(
    "forwardState",
    (next, name, routeParams, routeSearch) => {
      passes += 1;

      return next(name, routeParams, routeSearch);
    },
  );

  const href = buildHref(router, routeName, params, search);

  remove();
  router.stop();

  return { passes, href };
}

describe("one href runs the seam once (#2260)", () => {
  it("a forwarding route: one pass, and the href still resolves", async () => {
    const { passes, href } = await countedHref("old");

    expect(passes, "one operation, one chain").toBe(1);
    expect(href, "#2250 — the href is where the click lands").toBe(
      "/fresh/1?tab=a",
    );
  });

  it("a plain route: one pass, and the href is unchanged", async () => {
    const { passes, href } = await countedHref("plain");

    expect(passes, "one operation, one chain").toBe(1);
    expect(href).toBe("/plain/1");
  });

  it("an explicit query channel rides the ONE pass", async () => {
    const { passes, href } = await countedHref("fresh", PARAMS, { tab: "b" });

    expect(passes).toBe(1);
    expect(href).toBe("/fresh/1?tab=b");
  });

  it("CONTROL — the counter sees a pass at all", async () => {
    // Without this cell every assertion above would also pass on an
    // interceptor that was never registered, or on a `buildHref` that threw
    // before reaching the router at all.
    const { passes } = await countedHref("home", {});

    expect(passes, "the instrument is live").toBeGreaterThan(0);
  });
});
