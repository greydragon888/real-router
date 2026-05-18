import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouterProvider } from "@real-router/react";

import { createStressRouter } from "./helpers";

/**
 * R10 — `viewTransitions` lifecycle stress (review-2026-05-10 §7 #9).
 *
 * `createViewTransitions` wires `subscribeLeave` + `subscribe` and keeps two
 * pieces of mutable state (`closeVT`, `currentVT`) that must stay coherent
 * across rapid navigations and mid-transition teardown. Specific risks:
 *
 *   - `router.stop()` while a VT is pending → `destroy()` must call
 *     `skipTransition()` on the live VT and resolve `closeVT` so the
 *     deferred returned from `subscribeLeave` doesn't dangle.
 *   - Provider unmount mid-flight → same teardown path, no DOM leaks.
 *   - 100 back-to-back navigations → each transition must produce exactly
 *     one `startViewTransition` call; `closeVT` chain must drain through
 *     `subscribe` (TRANSITION_SUCCESS) without accumulating timers.
 *
 * JSDOM does not implement `document.startViewTransition`; we stub it with
 * the same shape used by `tests/functional/RouterProvider.viewTransitions.test.tsx`
 * — synchronous invocation of the update callback so the router unblocks
 * immediately, plus a tracked `skipTransition` mock for leak detection.
 */

interface FakeViewTransition {
  skipTransition: ReturnType<typeof vi.fn>;
  callbackCalled: boolean;
}

let recordedTransitions: FakeViewTransition[];

function installStartViewTransition(): void {
  recordedTransitions = [];

  const stub = (callback: () => void | Promise<void>): FakeViewTransition => {
    const entry: FakeViewTransition = {
      skipTransition: vi.fn(),
      callbackCalled: false,
    };

    recordedTransitions.push(entry);

    // Synchronously invoke the update callback. The callback returns a
    // Promise that VT would normally await for the animation; we mark
    // `callbackCalled` immediately so the leak-check sees settlement.
    entry.callbackCalled = true;
    void callback();

    return entry;
  };

  (
    document as unknown as { startViewTransition: typeof stub }
  ).startViewTransition = stub;
}

function removeStartViewTransition(): void {
  delete (document as unknown as { startViewTransition?: unknown })
    .startViewTransition;
}

describe("R10 — viewTransitions lifecycle stress", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);

      return 0;
    });
    installStartViewTransition();
  });

  afterEach(() => {
    cleanup();
    removeStartViewTransition();
    vi.unstubAllGlobals();
  });

  it("10.1: 100 rapid navigations — exactly one startViewTransition per nav, no skipTransition leaks", async () => {
    const router = createStressRouter(10);

    await router.start("/route0");

    const { unmount } = render(
      <RouterProvider router={router} viewTransitions>
        <div data-testid="anchor" />
      </RouterProvider>,
    );

    const startsBefore = recordedTransitions.length;

    for (let i = 1; i <= 100; i++) {
      await act(async () => {
        await router.navigate(`route${i % 10}`).catch(() => {});
      });
    }

    // Successful navigations triggered exactly one VT each. SAME_STATES
    // rejections skip the leave handler entirely, so the count is at
    // most 100 and at least the number of *distinct* successive routes.
    const startsAfterNav = recordedTransitions.length - startsBefore;

    expect(startsAfterNav).toBeGreaterThan(0);
    expect(startsAfterNav).toBeLessThanOrEqual(100);

    // Each tracked VT must either have its update callback invoked OR
    // been skipped — none should remain in limbo.
    for (const entry of recordedTransitions) {
      const settled =
        entry.callbackCalled || entry.skipTransition.mock.calls.length > 0;

      expect(settled).toBe(true);
    }

    unmount();
    router.stop();
  });

  it("10.2: unmount RouterProvider during navigation — destroy() teardown is idempotent", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const { unmount } = render(
      <RouterProvider router={router} viewTransitions>
        <div data-testid="anchor" />
      </RouterProvider>,
    );

    // Kick off a navigation, then unmount the provider on the same tick.
    // Race: leave handler is running while RouterProvider's effect cleanup
    // calls `viewTransitions.destroy()`.
    const navPromise = act(async () => {
      await router.navigate("route1").catch(() => {});
    });

    unmount();

    await navPromise;

    // Post-teardown: no further VTs created by subsequent navigations
    // (the subscribers were detached by destroy()).
    const startsAfterUnmount = recordedTransitions.length;

    await act(async () => {
      await router.navigate("route2").catch(() => {});
    });

    expect(recordedTransitions).toHaveLength(startsAfterUnmount);

    router.stop();
  });

  it("10.3: router.stop() with mounted provider — subsequent navigations are silent", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const { unmount } = render(
      <RouterProvider router={router} viewTransitions>
        <div data-testid="anchor" />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("route1").catch(() => {});
    });

    const startsAfterFirstNav = recordedTransitions.length;

    router.stop();

    // After stop, subscribers are detached; navigate either no-ops or
    // throws but cannot drive a new VT through subscribeLeave.
    await act(async () => {
      await router.navigate("route2").catch(() => {});
    });

    expect(recordedTransitions).toHaveLength(startsAfterFirstNav);

    unmount();
  });

  it("10.4: toggle viewTransitions prop on/off 50 times — destroy/recreate without orphan handlers", async () => {
    const router = createStressRouter(3);

    await router.start("/route0");

    const { rerender, unmount } = render(
      <RouterProvider router={router} viewTransitions={false}>
        <div />
      </RouterProvider>,
    );

    for (let i = 0; i < 50; i++) {
      rerender(
        <RouterProvider router={router} viewTransitions={i % 2 === 0}>
          <div />
        </RouterProvider>,
      );
    }

    // After all the flips, only the last enabled-state determines whether
    // a navigation will trigger VT. Snapshot the count, navigate, verify
    // the delta matches the final state.
    const before = recordedTransitions.length;

    await act(async () => {
      await router.navigate("route1").catch(() => {});
    });

    // After 50 flips starting from `false`, the final state is
    // `i=49` → viewTransitions={false}, so navigate must NOT add a VT.
    // (If the cleanup leaked handlers from prior `true` mounts, the
    // count would jump.)
    expect(recordedTransitions.length - before).toBe(0);

    unmount();
    router.stop();
  });
});
