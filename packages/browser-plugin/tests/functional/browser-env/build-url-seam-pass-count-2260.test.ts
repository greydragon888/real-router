import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { createPluginBuildUrl } from "../../../src/browser-env/plugin-utils";

import type { Params, Route, SearchParams } from "@real-router/core";

/**
 * One URL is ONE operation, so a plugin's `forwardState` interceptor runs once
 * for it (#2260).
 *
 * ⚑ **This is the arm every application takes, and it is the reason this file
 * exists beside the `shared/dom-utils` one.** `buildHref` prefers
 * `router.buildUrl`; all three URL plugins register that extension from this one
 * factory, and the `buildPath` pair in `shared/dom-utils` is reached only when no
 * URL plugin is installed. The factory's own docblock says a fix landing on the
 * fallback alone is "green in tests and dead in production" — which is exactly
 * what the first pass at #2260 did, until this cell was written.
 *
 * ⚠ **Counted, not read.** This builder resolves through `forwardState` and then
 * printed through `router.buildPath`, which runs the same chain one door lower
 * (#2087) — so one URL invoked every registered interceptor twice. Neither door
 * says "twice"; the second pass is what two individually-correct doors compose
 * to. The sibling count lives in
 * `packages/react/tests/functional/dom-utils/href-seam-pass-count-2260.test.ts`.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/home" },
  { name: "old", path: "/old/:id", forwardTo: "fresh" },
  { name: "fresh", path: "/fresh/:id?tab", defaultSearch: { tab: "a" } },
  { name: "plain", path: "/plain/:id" },
];

const PARAMS = { id: "1" };

interface Counted {
  readonly passes: number;
  readonly url: string;
}

/** One `buildUrl`, with the chain a plugin registers counted around it. */
async function countedUrl(
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

  const url = createPluginBuildUrl(router, "")(routeName, params, search);

  remove();
  router.stop();

  return { passes, url };
}

describe("one plugin-built URL runs the seam once (#2260)", () => {
  it("a forwarding route: one pass, and the URL still resolves", async () => {
    const { passes, url } = await countedUrl("old");

    expect(passes, "one operation, one chain").toBe(1);
    expect(url, "#2250 — the URL is where the click lands").toBe(
      "/fresh/1?tab=a",
    );
  });

  it("a plain route: one pass, and the URL is unchanged", async () => {
    const { passes, url } = await countedUrl("plain");

    expect(passes, "one operation, one chain").toBe(1);
    expect(url).toBe("/plain/1");
  });

  it("an explicit query channel rides the ONE pass", async () => {
    const { passes, url } = await countedUrl("fresh", PARAMS, { tab: "b" });

    expect(passes).toBe(1);
    expect(url).toBe("/fresh/1?tab=b");
  });

  it("CONTROL — the counter sees a pass at all", async () => {
    // Without this cell every assertion above would also pass on an interceptor
    // that was never registered, or on a builder that threw before reaching the
    // router.
    const { passes } = await countedUrl("home", {});

    expect(passes, "the instrument is live").toBeGreaterThan(0);
  });
});
