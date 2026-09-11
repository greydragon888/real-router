import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import { createMockNavigationBrowser } from "../helpers/testUtils";

import type { NavigationBrowser } from "../../src/types";
import type { Route, Router } from "@real-router/core";

/**
 * The URL a `<Link>` renders through this plugin is where its click goes,
 * `forwardTo` included (#2250 · core INVARIANTS `buildPath / matchPath` #7).
 *
 * ⚑ **Each URL plugin pins this door itself.** The three share nothing at the
 * pin level even where they share `createPluginBuildUrl`: reverting that shared
 * door reds browser-plugin and hash-plugin and left this package entirely green,
 * which is how a behaviour it SHIPS can change with nothing to say so.
 */
const ROUTES: readonly Route[] = [
  { name: "home", path: "/home" },
  { name: "old", path: "/old/:id", forwardTo: "fresh" },
  { name: "fresh", path: "/fresh/:id?tab", defaultSearch: { tab: "a" } },
  { name: "plain", path: "/plain/:id" },
];

const PARAMS = { id: "1" };

let router: Router;
let mockNav: MockNavigation;
let browser: NavigationBrowser;

describe("navigation-plugin buildUrl on a forwarding route (#2250)", () => {
  beforeEach(async () => {
    mockNav = new MockNavigation("http://localhost/");
    browser = createMockNavigationBrowser(mockNav);
    router = createRouter([...ROUTES]);
    router.usePlugin(navigationPluginFactory({}, browser));
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("builds the URL the same intent commits", async () => {
    const url = router.buildUrl("old", PARAMS);
    const committed = await getPluginApi(router).navigateToState(
      getPluginApi(router).buildNavigationState("old", PARAMS)!,
    );

    expect(url).toBe("/fresh/1?tab=a");
    expect(url).toBe(committed.path);
  });

  it("keeps the base prefix while resolving", async () => {
    // The prefixing half must survive the door change — it is the only thing
    // this builder adds over the path it asks for.
    router.stop();
    router = createRouter([...ROUTES]);
    router.usePlugin(navigationPluginFactory({ base: "/app" }, browser));
    await router.start("/app/home");

    expect(router.buildUrl("old", PARAMS)).toBe("/app/fresh/1?tab=a");
  });

  it("CONTROL — a non-forwarding route is untouched", () => {
    expect(router.buildUrl("plain", PARAMS)).toBe("/plain/1");
  });

  it("CONTROL — an unknown route still THROWS, the failure shape is unchanged", () => {
    // `buildNavigationState` answers `undefined` here where `buildPath` throws.
    // The `??` fallback is what keeps the throw.
    expect(() => router.buildUrl("nope", PARAMS)).toThrow();
  });

  it("CONTROL — the hash slot still rides on the resolved URL", () => {
    expect(router.buildUrl("old", PARAMS, undefined, { hash: "s" })).toBe(
      "/fresh/1?tab=a#s",
    );
  });

  it("CONTROL — buildPath itself stays LITERAL, its capability intact", () => {
    // core INVARIANTS `makeState` #8: the literal form is why a plugin can build
    // a state for an alias without being teleported off it.
    expect(router.buildPath("old", PARAMS)).toBe("/old/1");
  });
});
