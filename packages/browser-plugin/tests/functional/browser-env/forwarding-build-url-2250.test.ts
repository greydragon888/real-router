import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { createPluginBuildUrl } from "../../../src/browser-env/plugin-utils";

import type { Route, Router } from "@real-router/core";

/**
 * The URL a `<Link>` renders through a URL plugin is where its click goes,
 * `forwardTo` included (#2250 · INVARIANTS `buildPath / matchPath` #7).
 *
 * ⚑ **This is the arm every application takes.** `buildHref` prefers
 * `router.buildUrl`, and all three URL plugins register that extension from this
 * one factory — the `router.buildPath` fallback in `shared/dom-utils` is reached
 * only when no URL plugin is installed. A fix that lands on the fallback alone is
 * green in the adapter suites and dead in production, which is why the two arms
 * are pinned separately; the sibling file is
 * `packages/react/tests/functional/dom-utils/forwarding-link-href-2250.test.ts`.
 *
 * ⚠ **The door is the one `createReplaceHistoryState` already takes.** That
 * function, next to this one in the same file, resolves through
 * `buildNavigationState` for the same reason (#1585 / #1574). These two were the
 * sibling pair and only one of them had it.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/home" },
  { name: "old", path: "/old/:id", forwardTo: "fresh" },
  { name: "fresh", path: "/fresh/:id?tab", defaultSearch: { tab: "a" } },
  { name: "plain", path: "/plain/:id" },
  { name: "q", path: "/q?page" },
];

const PARAMS = { id: "1" };

async function started(): Promise<Router> {
  const router = createRouter([...ROUTES]);

  await router.start("/home");

  return router;
}

describe("createPluginBuildUrl on a forwarding route (#2250)", () => {
  it("builds the URL the same intent commits", async () => {
    const router = await started();
    const buildUrl = createPluginBuildUrl(router, "");

    const url = buildUrl("old", PARAMS);
    const committed = await getPluginApi(router).navigateToState(
      getPluginApi(router).buildNavigationState("old", PARAMS)!,
    );

    expect(url).toBe("/fresh/1?tab=a");
    expect(url).toBe(committed.path);

    router.stop();
  });

  it("keeps the base prefix while resolving", async () => {
    // The prefixing half must survive the door change — it is the only thing this
    // factory adds over the builder it wraps.
    const router = await started();

    expect(createPluginBuildUrl(router, "/app")("old", PARAMS)).toBe(
      "/app/fresh/1?tab=a",
    );

    router.stop();
  });

  it("resolves with the params slot OMITTED, not just empty", async () => {
    // The slot is optional on this builder and REQUIRED on `forwardState`, so
    // the omitted case travels a default the supplied case never reaches
    // (#2248). A route with no path slot is what makes the call legal.
    const buildUrl = createPluginBuildUrl(await started(), "");

    expect(buildUrl("q")).toBe("/q");
  });

  it("CONTROL — a non-forwarding route is untouched, base and all", async () => {
    const router = await started();

    expect(createPluginBuildUrl(router, "")("plain", PARAMS)).toBe("/plain/1");
    expect(createPluginBuildUrl(router, "/app")("plain", PARAMS)).toBe(
      "/app/plain/1",
    );

    router.stop();
  });

  it("CONTROL — an unknown route still THROWS, the failure shape is unchanged", async () => {
    // `forwardState` THROWS for a name the table does not hold, which is where
    // the retired `?? router.buildPath(...)` fallback led anyway — `buildPath`
    // throws for one too (#2248). The adapters' "Route is not defined" path is
    // pinned on that throw (`packages/react/INVARIANTS.md` row 3).
    const router = await started();
    const buildUrl = createPluginBuildUrl(router, "");

    expect(() => buildUrl("nope", PARAMS)).toThrow();

    router.stop();
  });

  it("refuses the pre-split spelling exactly as navigate refuses it (#1572)", async () => {
    // ⚠ A SECOND href/destination divergence the resolving door closes. The
    // channel guard has always thrown on the click; `buildPath` answers the
    // literal path and used to supply the href, so a `<Link>` rendered a
    // working URL for an intent that could not commit. Measured: `buildPath`
    // still answers "/q", this door and `navigate` both throw.
    const router = await started();

    expect(() => createPluginBuildUrl(router, "")("q", { page: "2" })).toThrow(
      TypeError,
    );
    expect(router.buildPath("q", { page: "2" })).toBe("/q");
    // The guard runs ahead of the promise, so `navigate` throws SYNCHRONOUSLY —
    // `rejects` never sees it.
    expect(() => router.navigate("q", { page: "2" })).toThrow(TypeError);

    // CONTROL — the channel the split declares still builds.
    expect(createPluginBuildUrl(router, "")("q", {}, { page: "2" })).toBe(
      "/q?page=2",
    );

    router.stop();
  });

  it("CONTROL — the hash slot still rides on the resolved URL", async () => {
    const router = await started();

    expect(
      createPluginBuildUrl(router, "")("old", PARAMS, undefined, { hash: "s" }),
    ).toBe("/fresh/1?tab=a#s");

    router.stop();
  });
});
