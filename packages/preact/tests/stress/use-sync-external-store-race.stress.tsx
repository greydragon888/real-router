// packages/preact/tests/stress/use-sync-external-store-race.stress.tsx

/**
 * Stress regression for the Preact `useSyncExternalStore` polyfill race.
 *
 * Preact has no native `useSyncExternalStore`. The polyfill in
 * `src/useSyncExternalStore.ts` reads `getSnapshot()` at render, then
 * defensively re-reads inside `useEffect` (line 34: `sync()` before
 * `subscribe(sync)`). The race: the store can mutate between the render
 * read and the effect read; without the in-effect `sync()`, the very first
 * commit would be stale for that one render only — silently desyncing
 * `useRouteNode` / `useRoute` / `useRouterTransition` consumers from the
 * router state.
 *
 * Closes §7.3 review item: "race-fix `sync()` (line 34) zero direct
 * regression — Удаление silently сломает but no test catches it."
 *
 * The test forces the race by mounting many subscribers in rapid succession
 * while a sequence of navigations rolls through. If the polyfill skips the
 * post-mount `sync()`, the assertions below catch a stale-snapshot commit.
 */

import { act, render, cleanup } from "@testing-library/preact";
import { useEffect, useState } from "preact/hooks";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { RouterProvider, useRoute, useRouteNode } from "@real-router/preact";

import { createStressRouter } from "./helpers";

import type { Router } from "@real-router/core";
import type { FunctionComponent } from "preact";

describe("R — useSyncExternalStore polyfill race (§7.3)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter(20);
    await router.start("/route0");
  });

  afterEach(() => {
    router.stop();
    cleanup();
  });

  it("late-mounted consumer commits with the post-navigation snapshot, not the pre-mount one", async () => {
    // The race window is: store mutates between `useState(getSnapshot)`
    // (render) and `useEffect` (commit). The mid-render mount below mounts
    // the consumer SYNCHRONOUSLY during a parent re-render that itself was
    // triggered by a navigation — so the render read and the commit read
    // can disagree. The post-mount `sync()` is what reconciles them.
    //
    // We trigger the race by toggling a parent flag inside an effect that
    // fires after navigation: the child mounts on the next render, by
    // which point the store snapshot has advanced.
    let lastObservedName: string | null = null;

    const Consumer: FunctionComponent = () => {
      const { route } = useRoute();

      lastObservedName = route.name;

      return <div data-testid="consumer">{route.name}</div>;
    };

    const Probe: FunctionComponent = () => {
      const [mounted, setMounted] = useState(false);

      useEffect(() => {
        // Schedule mount AFTER router has committed a new state — this is
        // the exact window the polyfill's in-effect `sync()` must cover.
        // The setState-in-effect pattern is intentional here: this is the
        // race we're regressing against.
        // eslint-disable-next-line @eslint-react/set-state-in-effect
        setMounted(true);
      }, []);

      return <>{mounted ? <Consumer /> : <div data-testid="placeholder" />}</>;
    };

    // Cycle navigations during mounting to widen the race window.
    await act(async () => {
      await router.navigate("route5");
    });

    const { getByTestId } = render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    await act(async () => {
      await router.navigate("route7");
    });

    // After the navigate flush, the late-mounted Consumer must show the
    // post-navigation route — never a stale snapshot. A regression that
    // dropped the in-effect `sync()` would leave Consumer rendering the
    // route name that was active at its mount time, not the current one.
    expect(getByTestId("consumer").textContent).toBe("route7");
    expect(lastObservedName).toBe("route7");
  });

  it("rapid mount + navigate burst — 50 cycles, every commit reflects the current snapshot", async () => {
    // Concurrency pressure: 50 mount/unmount cycles, each followed by a
    // navigation. The polyfill must reconcile EVERY mount with the current
    // store snapshot — a missed `sync()` shows up as a divergence between
    // `router.getState()` and the most recent consumer render.
    const observedNames: string[] = [];

    const NodeConsumer: FunctionComponent = () => {
      // useRouteNode goes through `createRouteNodeSource` →
      // `useSyncExternalStore`. Same polyfill path.
      const result = useRouteNode("");

      observedNames.push(result.route?.name ?? "<none>");

      return <div />;
    };

    const Host: FunctionComponent<{ mounted: boolean }> = ({ mounted }) =>
      mounted ? <NodeConsumer /> : null;

    let view: ReturnType<typeof render> | null = null;

    // Alternate between two route pools — route 2i and 2i+1 — so every
    // navigate is guaranteed to land on a different route than the previous
    // one (avoids SAME_STATES rejection from the cached fast path).
    for (let i = 0; i < 50; i++) {
      const targetRoute = `route${1 + (i % 18)}`;

      await act(async () => {
        await router.navigate(targetRoute);
      });

      view?.unmount();
      view = render(
        <RouterProvider router={router}>
          <Host mounted />
        </RouterProvider>,
      );

      // The freshly mounted NodeConsumer must observe the route that core
      // just committed.
      const latest = observedNames.at(-1);

      expect(latest).toBe(targetRoute);
    }

    view?.unmount();
  });

  it("Object.is bail-out: identical snapshot on resubscribe does NOT cause spurious re-render", async () => {
    // The polyfill's updater uses `Object.is`:
    //   setValue(prev => Object.is(prev, next) ? prev : next)
    // A regression that returns `next` unconditionally would re-render every
    // subscription even when the snapshot is referentially stable.
    let renderCount = 0;

    const Consumer: FunctionComponent = () => {
      renderCount++;
      useRouteNode("admin"); // inactive — same `undefined`-route snapshot

      return <div />;
    };

    render(
      <RouterProvider router={router}>
        <Consumer />
      </RouterProvider>,
    );

    const initial = renderCount;

    // Navigate to routes OUTSIDE the "admin" subtree — `useRouteNode("admin")`
    // sees the same inactive snapshot. Object.is keeps the prev value.
    // Skip route0 (initial) to avoid SAME_STATES rejection.
    for (let i = 1; i <= 10; i++) {
      await act(async () => {
        await router.navigate(`route${i}`);
      });
    }

    // 10 navigations, all to inactive-from-admin routes. Snapshot stays
    // referentially equal → the Object.is path bails out. We allow a tiny
    // budget for harness-driven re-renders (StrictMode-style remount edges)
    // but the count must NOT scale linearly with navigations.
    const delta = renderCount - initial;

    expect(delta).toBeLessThanOrEqual(2);
  });
});
