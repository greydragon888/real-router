/**
 * Stress coverage for the new code introduced in this fix cycle (#580):
 *   - `isSameHref` (src/href-utils.ts) — pure URL-equivalence helper
 *   - Same-URL guard in `NavigationPlugin.onTransitionSuccess` — routes
 *     same-URL transitions to `updateCurrentEntry` instead of `nav.navigate`
 *   - `PLUGIN_SYNC_INFO` info-sentinel detection in `createNavigateHandler`
 *
 * Each test below targets one of the failure modes outlined in the audit:
 *   NC1  Async-dispatch storm — WKWebView-style microtask-deferred events
 *        under high load. Verifies info-sentinel detection does not depend
 *        on dispatch timing even when many events are queued back-to-back.
 *   NC2  Alternating same-URL / different-URL storm — verifies the guard
 *        switches branches cleanly without leaking `#capturedMeta` between
 *        transitions and that both branches produce correct NavigationMeta.
 *   NC3  PLUGIN_SYNC_INFO literal-string collision under load — documents
 *        the limitation that a consumer passing the exact sentinel string
 *        as `info` will be short-circuited. Runs N=100 to lock in the
 *        deterministic outcome.
 *   NC4  Non-special-scheme storm — many fresh cold-starts under a base
 *        URL with empty pathname (`tauri://localhost`). Locks in the
 *        component-wise `isSameHref` fix that resolved the #580 first-
 *        iteration cross-document reload.
 */
import { createRouter } from "@real-router/core";
import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { navigationPluginFactory } from "@real-router/navigation-plugin";

import { createStressRouter, noop, routeConfig } from "./helpers";
import { PLUGIN_SYNC_INFO } from "../../src/navigation-browser";
import { MockNavigation } from "../helpers/mockNavigation";
import { createMockNavigationBrowser } from "../helpers/testUtils";

import type { Router, Unsubscribe } from "@real-router/core";

let router: Router | undefined;
let unsubscribe: Unsubscribe | undefined;

describe("Same-URL guard + info-sentinel — stress (#580)", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterEach(() => {
    router?.stop();
    unsubscribe?.();
    unsubscribe = undefined;
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("NC1 — async-dispatch storm: 500 alternating navigations under microtask-deferred events stay loop-free", async () => {
    // MockNavigation in `enableAsyncDispatch` mode delivers `navigate` events
    // on a subsequent microtask, mirroring Safari 26.2 WKWebView. The
    // previous `SyncingFlag` mechanism failed exactly here — the flag was
    // cleared before the deferred event arrived. The info-sentinel must
    // survive arbitrary queueing depth.
    const mockNav = new MockNavigation("http://localhost/");

    mockNav.enableAsyncDispatch();

    const browser = createMockNavigationBrowser(mockNav);

    router = createRouter(routeConfig, {
      defaultRoute: "home",
      allowNotFound: true,
    });
    unsubscribe = router.usePlugin(
      navigationPluginFactory({ forceDeactivate: true }, browser),
    );

    await router.start();

    const navigateSpy = vi.spyOn(router, "navigate");

    // Alternate between two distinct URLs so the same-URL guard does NOT
    // short-circuit — the plugin must go through `nav.navigate`, which fires
    // a deferred navigate event under async dispatch. Each iteration:
    //   user-driven router.navigate → plugin's onTransitionSuccess →
    //   nav.navigate(url, {info: PLUGIN_SYNC_INFO}) → async event →
    //   handler's `event.info === PLUGIN_SYNC_INFO` short-circuit.
    // A regression that lost the info identity through async queueing would
    // re-enter router.navigate, doubling (or worse) the spy count.
    const N = 500;

    for (let i = 0; i < N; i++) {
      await router.navigate(i % 2 === 0 ? "users.list" : "home");
    }

    // Drain any tail microtasks so deferred events that arrive after the
    // last navigation also get processed.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(navigateSpy).toHaveBeenCalledTimes(N);
    expect(router.getState()?.name).toBe(
      (N - 1) % 2 === 0 ? "users.list" : "home",
    );
  });

  it("NC2 — alternating same-URL / different-URL storm: navigationType meta matches the call on every iteration", async () => {
    // Alternates between reload-on-current-route (same URL →
    // updateCurrentEntry branch, navigationType "reload") and navigate-to-
    // other-route (different URL → nav.navigate branch, navigationType
    // "push"). A regression that let `#capturedMeta` leak between branches
    // (e.g., updateCurrentEntry path forgetting to consume the captured
    // meta) would surface as a wrong navigationType on one branch — e.g.,
    // the "reload" intended for the same-URL transition appearing on the
    // next push to a different route, or vice versa.
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { browser } = result;
    const updateSpy = vi.spyOn(browser, "updateCurrentEntry");
    const navSpy = vi.spyOn(browser, "navigate");

    await router.start();

    // Land on a concrete leaf route so subsequent reloads stay at the same
    // URL. After `router.start()` the plugin's own initial transition may
    // have hit either branch (depending on the mock's initial URL) — those
    // calls are part of the pre-iteration baseline and excluded via the
    // per-iteration snapshot pattern.
    await router.navigate("home");

    let currentRoute: "home" | "users.list" = "home";
    let updateBranchCount = 0;
    let navBranchCount = 0;

    const N = 200;

    for (let i = 0; i < N; i++) {
      const updatePre = updateSpy.mock.calls.length;
      const navPre = navSpy.mock.calls.length;
      const isSameUrl = i % 2 === 0;

      // Compute expected counts/type BEFORE the action so the post-action
      // expectations are unconditional — keeps `vitest/no-conditional-expect`
      // happy. Action is the only branching point.
      const expectedUpdate = isSameUrl ? updatePre + 1 : updatePre;
      const expectedNav = isSameUrl ? navPre : navPre + 1;
      const expectedType = isSameUrl ? "reload" : "push";

      if (isSameUrl) {
        await router.navigate(currentRoute, {}, undefined, { reload: true });
        updateBranchCount++;
      } else {
        const nextRoute: "home" | "users.list" =
          currentRoute === "home" ? "users.list" : "home";

        await router.navigate(nextRoute);
        navBranchCount++;
        currentRoute = nextRoute;
      }

      const meta = (
        router.getState()?.context as
          { navigation?: { navigationType: string } } | undefined
      )?.navigation;

      expect(updateSpy).toHaveBeenCalledTimes(expectedUpdate);
      expect(navSpy).toHaveBeenCalledTimes(expectedNav);
      expect(meta?.navigationType).toBe(expectedType);
    }

    expect(updateBranchCount).toBe(N / 2);
    expect(navBranchCount).toBe(N / 2);
  });

  it("NC3 — PLUGIN_SYNC_INFO literal-string collision: consumer that passes the sentinel themselves is short-circuited (documented limitation)", async () => {
    // Documented edge case: if a consumer happens to pass the exact string
    // `"@real-router/navigation-plugin:syncing"` as `info` in their own
    // `nav.navigate(url, {info})` call, the plugin's handler will short-
    // circuit it just like a plugin-originated event. The sentinel is
    // namespaced (`@real-router/...:syncing`) precisely to make this
    // unlikely in practice; this test locks in the deterministic outcome
    // so a future regression that, e.g., loosens the comparison or removes
    // the namespace prefix surfaces here.
    //
    // Run N=100 collisions to verify the outcome is stable under load (the
    // handler never accidentally lets one through under any GC / event-
    // queue state).
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { mockNav } = result;

    await router.start();

    const navigateSpy = vi.spyOn(router, "navigate");
    const beforeCount = navigateSpy.mock.calls.length;

    const N = 100;

    for (let i = 0; i < N; i++) {
      // User-initiated navigation that LITERALLY carries the sentinel as
      // info. The handler reads event.info === PLUGIN_SYNC_INFO and
      // short-circuits with a noop intercept — router.navigate is NOT
      // called for any of these.
      const { finished } = mockNav.navigate(
        `http://localhost/users/list?i=${i}`,
        { info: PLUGIN_SYNC_INFO },
      );

      await finished.catch(noop);
    }

    expect(navigateSpy).toHaveBeenCalledTimes(beforeCount);
    // Router state stayed at the post-start route — none of the
    // collision-tagged events made it through.
    expect(router.getState()?.name).toBe("index");
  });

  it("NC4 — non-special-scheme storm: 200 cold starts under `tauri://localhost` (no trailing slash) always route through updateCurrentEntry", async () => {
    // Repro for the #580 first-iteration case: `currentEntry.url` is
    // reported as `"tauri://localhost"` (no slash — non-special scheme
    // preserves empty pathname). Without the component-wise `isSameHref`
    // (`pathname || "/"` normalisation), the guard returned false on the
    // FIRST transition, the plugin called nav.navigate, and WKWebView
    // triggered a cross-document reload — one extra reboot per cold start.
    //
    // 200 isolated cold-start cycles. Every single one must hit
    // updateCurrentEntry on the initial transition (no slash → "/"
    // normalisation must compare equal). A regression that switched back
    // to raw `.href` equality would cause `navSpy.toHaveBeenCalled()` to
    // succeed on iteration #0 and the assertion below would catch it.
    const N = 200;
    let updateCount = 0;
    let navCount = 0;

    for (let i = 0; i < N; i++) {
      const mockNav = new MockNavigation("tauri://localhost");
      const browser = createMockNavigationBrowser(mockNav);
      const localRouter = createRouter(routeConfig, {
        defaultRoute: "home",
        allowNotFound: true,
      });
      const localUnsub = localRouter.usePlugin(
        navigationPluginFactory({ forceDeactivate: true }, browser),
      );

      const updateSpy = vi.spyOn(browser, "updateCurrentEntry");
      const navSpy = vi.spyOn(browser, "navigate");

      await localRouter.start();

      // Initial URL is `tauri://localhost` (no slash); resolved finalUrl is
      // `/` which canonicalises to pathname "/". Component-wise comparison:
      // `("" || "/") === "/"` → true → updateCurrentEntry.
      if (updateSpy.mock.calls.length > 0) {
        updateCount++;
      }

      if (navSpy.mock.calls.length > 0) {
        navCount++;
      }

      localRouter.stop();
      localUnsub();
    }

    // Every cold-start must take the updateCurrentEntry branch — zero
    // cross-document reloads on first transition.
    expect(updateCount).toBe(N);
    expect(navCount).toBe(0);
  });
});
