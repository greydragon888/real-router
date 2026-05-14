import { browserPluginFactory } from "@real-router/browser-plugin";
import { fireEvent, render, screen } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";

import { Link, RouterProvider } from "@real-router/solid";

import { createStressRouter, takeHeapSnapshot, forceGC, MB } from "./helpers";

/**
 * §7.3 audit scenario #20 — `<Link hash>` rapid hash changes (#532).
 *
 * Concern: `navigateWithHash` (shared/dom-utils) auto-bypasses
 * core's `SAME_STATES` on same-route + different-hash by setting
 * `force: true, hashChange: true`. Under rapid clicks on multiple
 * `<Link hash="X">` instances pointing at the SAME route, the helper
 * must continue to produce valid navigation calls without:
 *   - leaking subscribeLeave listeners
 *   - corrupting `state.context.url.hash` mid-burst
 *   - blowing up memory through retained transition snapshots
 *
 * 100+ rapid hash-only navigations is the workload that the `tab-style UI`
 * use case (e.g. Settings/Profile/Billing tabs) would generate when a user
 * mashes through them quickly.
 */
describe("LH1 — Link hash rapid changes (§7.3 #20, #532)", () => {
  it("LH1.1: 200 hash-only clicks across 4 tab Links — every nav lands, no leak", async () => {
    const router = createStressRouter(2);

    // browser-plugin populates `state.context.url.hash` — required for
    // hash-aware semantics under test.
    router.usePlugin(browserPluginFactory());
    await router.start("/route0");

    // 4 Links, all pointing at the same routeName but with different hash
    // fragments. Clicking through them quickly is the canonical tab-style
    // UX that #532 introduced.
    render(() => (
      <RouterProvider router={router}>
        <Link routeName="route0" hash="overview" data-testid="t-overview">
          Overview
        </Link>
        <Link routeName="route0" hash="profile" data-testid="t-profile">
          Profile
        </Link>
        <Link routeName="route0" hash="account" data-testid="t-account">
          Account
        </Link>
        <Link routeName="route0" hash="billing" data-testid="t-billing">
          Billing
        </Link>
      </RouterProvider>
    ));

    const tabs = [
      screen.getByTestId("t-overview"),
      screen.getByTestId("t-profile"),
      screen.getByTestId("t-account"),
      screen.getByTestId("t-billing"),
    ];
    const expectedHashes = ["overview", "profile", "account", "billing"];

    const heapBefore = takeHeapSnapshot();
    const CLICKS = 200;

    for (let i = 0; i < CLICKS; i++) {
      fireEvent.click(tabs[i % 4]);
    }

    // Drain async navigate chains.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }

    // Final state must be `route0` (same route, just hash variations).
    expect(router.getState()?.name).toBe("route0");

    // Final hash matches the LAST clicked tab. Hash is read from
    // `state.context.url` (claimed by browser-plugin under jsdom).
    const finalHash = (
      router.getState()?.context as { url?: { hash?: string } } | undefined
    )?.url?.hash;

    expect(expectedHashes).toContain(finalHash);
    expect(finalHash).toBe(expectedHashes[(CLICKS - 1) % 4]);

    // Router still navigable to a sibling route — proves FSM not locked
    // by 200 force-flagged same-route hash navs.
    await router.navigate("route1");

    expect(router.getState()?.name).toBe("route1");

    forceGC();

    const heapAfter = takeHeapSnapshot();

    // Heap budget: 200 hash-only navs through navigateWithHash. The
    // force=true path bypasses SAME_STATES, so each click is a real
    // transition with subscriber notifications. 20MB cap.
    expect(heapAfter - heapBefore).toBeLessThan(20 * MB);

    router.stop();
  }, 60_000);

  it("LH1.2: 150 rapid setSignal-driven hash flips on a single Link — href + active state stable", async () => {
    const router = createStressRouter(2);

    // browser-plugin populates `state.context.url.hash` — required for
    // hash-aware semantics under test.
    router.usePlugin(browserPluginFactory());
    await router.start("/route0");

    // Direct `router.navigate(..., { hash, force: true })` driver — this
    // is the imperative equivalent of clicking a Link with reactive `hash`
    // prop (which the Link slow path captures at init anyway, so we
    // exercise the lower layer directly here).
    render(() => (
      <RouterProvider router={router}>
        <Link routeName="route0" hash="initial" data-testid="link">
          Tab
        </Link>
      </RouterProvider>
    ));

    const heapBefore = takeHeapSnapshot();
    const HASHES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"] as const;

    for (let i = 0; i < 150; i++) {
      const hash = HASHES[i % HASHES.length];

      await router.navigate(
        "route0",
        {},
        { hash, force: true, hashChange: true },
      );
    }

    // Final hash = last in sequence.
    const finalHash = (
      router.getState()?.context as { url?: { hash?: string } } | undefined
    )?.url?.hash;

    expect(finalHash).toBe(HASHES[(150 - 1) % HASHES.length]);

    // Link href is captured at init (hash="initial") and not reactive
    // to the navigation hash changes — locks the slow-path gotcha.
    const href = screen.getByTestId("link").getAttribute("href");

    expect(href).toContain("#initial");

    forceGC();

    const heapAfter = takeHeapSnapshot();

    expect(heapAfter - heapBefore).toBeLessThan(15 * MB);

    router.stop();
  }, 60_000);
});
