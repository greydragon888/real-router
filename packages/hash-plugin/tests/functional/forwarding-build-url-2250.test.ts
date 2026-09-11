import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import { noop, createMockedBrowser } from "../helpers/testUtils";

import type { Browser } from "../../src/browser-env";
import type { Route, Router } from "@real-router/core";

/**
 * The hash URL a `<Link>` renders is where its click goes, `forwardTo` included
 * (#2250 · core INVARIANTS `buildPath / matchPath` #7).
 *
 * ⚑ **This plugin keeps its OWN builder, so it needs its own pin.** browser- and
 * navigation-plugin share `createPluginBuildUrl` from `browser-env`, pinned in
 * `packages/browser-plugin/tests/functional/browser-env/forwarding-build-url-2250.test.ts`;
 * hash-plugin builds its copy locally because the warn-once on `{ hash }` is
 * local, and a copy is a place the door can differ.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/home" },
  { name: "old", path: "/old/:id", forwardTo: "fresh" },
  { name: "fresh", path: "/fresh/:id?tab", defaultSearch: { tab: "a" } },
  { name: "plain", path: "/plain/:id" },
  { name: "q", path: "/q?page" },
];

const PARAMS = { id: "1" };

let router: Router;
let mockedBrowser: Browser;

describe("hash-plugin buildUrl on a forwarding route (#2250)", () => {
  beforeEach(async () => {
    mockedBrowser = createMockedBrowser(noop);
    globalThis.history.replaceState({}, "", "/");
    router = createRouter([...ROUTES]);
    router.usePlugin(hashPluginFactory({}, mockedBrowser));
    await router.start("#/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("builds the URL the same intent commits", async () => {
    const url = router.buildUrl("old", PARAMS);
    const committed = await getPluginApi(router).navigateToState(
      getPluginApi(router).buildNavigationState("old", PARAMS)!,
    );

    expect(url).toBe("#/fresh/1?tab=a");
    expect(url).toBe(`#${committed.path}`);
  });

  it("keeps the prefix and the base while resolving", async () => {
    // The prefixing half must survive the door change — it is the only thing
    // this plugin's copy adds over the path it builds.
    router.stop();
    router = createRouter([...ROUTES]);
    router.usePlugin(
      hashPluginFactory({ base: "/app", hashPrefix: "!" }, mockedBrowser),
    );
    await router.start("/app#!/home");

    expect(router.buildUrl("old", PARAMS)).toBe("/app#!/fresh/1?tab=a");
  });

  it("CONTROL — a non-forwarding route is untouched", () => {
    expect(router.buildUrl("plain", PARAMS)).toBe("#/plain/1");
  });

  it("CONTROL — an unknown route still THROWS, the failure shape is unchanged", () => {
    // `forwardState` THROWS for a name the table does not hold, which is where
    // the retired `?? router.buildPath(...)` fallback led anyway — `buildPath`
    // throws for one too (#2248).
    expect(() => router.buildUrl("nope", PARAMS)).toThrow();
  });

  it("refuses the pre-split spelling exactly as navigate refuses it (#1572)", () => {
    // This plugin builds its own URL, so the refusal is pinned here too. The
    // guard runs ahead of the promise, so `navigate` throws SYNCHRONOUSLY.
    expect(() => router.buildUrl("q", { page: "2" })).toThrow(TypeError);
    expect(router.buildPath("q", { page: "2" })).toBe("/q");
    expect(() => router.navigate("q", { page: "2" })).toThrow(TypeError);

    // CONTROL — the channel the split declares still builds.
    expect(router.buildUrl("q", {}, { page: "2" })).toBe("#/q?page=2");
  });

  it("CONTROL — buildPath itself stays LITERAL, its capability intact", () => {
    // core INVARIANTS `makeState` #8: the literal form is why a plugin can build
    // a state for an alias without being teleported off it.
    expect(router.buildPath("old", PARAMS)).toBe("/old/1");
  });
});
