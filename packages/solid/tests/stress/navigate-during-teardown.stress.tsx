import { render } from "@solidjs/testing-library";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { RouterProvider, useRouteNode, Link } from "@real-router/solid";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";
import type { JSX } from "solid-js";

// Scenario S2 from audit section 7.2: a navigation fires concurrently with
// component teardown. Verifies no "setState after dispose" warnings and no
// zombie updates leaking past onCleanup boundaries.
describe("T1 — navigate during teardown", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(50);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
  });

  function Consumer(props: { readonly index: number }): JSX.Element {
    const routeState = useRouteNode(`route${props.index % 10}`);

    return (
      <div>
        {routeState().route?.name ?? "idle"}
        <Link routeName={`route${props.index % 10}`}>L</Link>
      </div>
    );
  }

  it("T1 — navigate fires during unmount — no zombie setState warnings", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { unmount } = render(() => (
      <RouterProvider router={router}>
        {Array.from({ length: 20 }, (_, i) => (
          <Consumer index={i} />
        ))}
      </RouterProvider>
    ));

    const navPromise = router.navigate("route5");

    unmount();

    await navPromise.catch(() => {});

    await router.navigate("route7").catch(() => {});

    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining("setState"),
    );
    expect(consoleWarn).not.toHaveBeenCalledWith(
      expect.stringContaining("dispose"),
    );

    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  // audit-2026-05-17 §7 P2 #2 — promote T1 from 1-iter check to 100-iter
  // stress. The original case proves "no zombie setState on a single
  // race"; this variant exercises 100 mount + navigate + unmount cycles
  // to surface any per-cycle leak (e.g. a per-iteration subscriber that
  // teardown forgets to drop).
  it("T1.2 — 100 mount + navigate + unmount cycles — no console errors, no zombie state", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    for (let i = 0; i < 100; i++) {
      const { unmount } = render(() => (
        <RouterProvider router={router}>
          <Consumer index={i} />
          <Consumer index={i + 1} />
        </RouterProvider>
      ));

      const target = `route${i % 50}`;
      const navPromise = router.navigate(target);

      // Unmount BEFORE the navigation settles. This is the "racing
      // teardown" path that should still drain cleanly.
      unmount();
      await navPromise.catch(() => {});
    }

    // No "setState after dispose" / "dispose during render" leaks across
    // the 100 cycles. A regression that left a single subscriber dangling
    // per iteration would emit at least one such warning during the
    // final post-burst navigation.
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining("setState"),
    );
    expect(consoleWarn).not.toHaveBeenCalledWith(
      expect.stringContaining("dispose"),
    );

    // Sanity: router still responds after the burst.
    await router.navigate("route3").catch(() => {});

    expect(router.getState()?.name).toBe("route3");

    consoleError.mockRestore();
    consoleWarn.mockRestore();
  }, 60_000);
});
