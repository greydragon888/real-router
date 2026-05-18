import { getPluginApi } from "@real-router/core/api";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { ErrorBoundary } from "solid-js";
import { describe, it, expect, vi } from "vitest";

import { RouterProvider } from "@real-router/solid";
import { Await, Streamed } from "@real-router/solid/ssr";

import { createStressRouter, forceGC, MB, takeHeapSnapshot } from "./helpers";

import type { PluginFactory } from "@real-router/core";
import type { JSX } from "solid-js";

/**
 * §7.2 audit scenario G10 — useDeferred race: navigate ↔ `<Await>` resolve.
 *
 * Concern: `<Await name="k">{value => …}` reads `useDeferred(k)` which
 * returns `route.context.ssrDataDeferred[k]`. Each route's `context.k`
 * is a distinct promise. Rapid navigation between route1 (deferred: p1)
 * and route2 (deferred: p2):
 *
 *   - Late resolve(p1) with value="A" lands AFTER user navigated to route2
 *   - `<Await>` must show p2's value (or fallback while p2 is pending),
 *     NEVER p1's stale value.
 *
 * Solid's `createResource` handles this contract: when the
 * `promiseAccessor` returns a new reference, the resource refetches
 * against the new source and the stale resource is discarded. Late
 * resolution of the abandoned promise is GC'd without surfacing.
 *
 * The test injects `state.context.ssrDataDeferred` per route via a
 * minimal `PluginFactory` (claimContextNamespace + onTransitionStart) —
 * the standard `ssr-data-plugin` intercepts `start()` only, so for a
 * race over navigate() boundaries we use this thin shim. Production
 * code paths (`useDeferred` + `<Await>`) are exercised end-to-end.
 */

function createDeferredInjectorPlugin(
  promisesByRoute: Map<string, Promise<unknown>>,
): PluginFactory {
  return (router) => {
    const api = getPluginApi(router);
    const claim = api.claimContextNamespace("ssrDataDeferred");

    return {
      onTransitionStart(toState) {
        const promise = promisesByRoute.get(toState.name);

        if (promise !== undefined) {
          // Write to context BEFORE state is frozen + emitted. Plugins'
          // onTransitionStart runs in TRANSITION_STARTED phase where
          // the next-state is still mutable per RouterInternals contract.
          claim.write(toState, { k: promise });
        }
      },
      teardown() {
        claim.release();
      },
    };
  };
}

interface DeferredResolvers {
  resolve: (value: string) => void;
  reject: (error: unknown) => void;
}

function deferredPair<T>(): {
  promise: Promise<T>;
  resolvers: DeferredResolvers;
} {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((error: unknown) => void) | undefined;
  const promise = new Promise<T>((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });

  return {
    promise,
    resolvers: { resolve: resolve! as never, reject: reject! },
  };
}

function Probe(props: Readonly<{ "data-testid"?: string }>): JSX.Element {
  return (
    <ErrorBoundary fallback={<div data-testid="err">err</div>}>
      <Streamed fallback={<div data-testid="pending">pending</div>}>
        <Await<string> name="k">
          {(value) => (
            <div data-testid={props["data-testid"] ?? "value"}>{value}</div>
          )}
        </Await>
      </Streamed>
    </ErrorBoundary>
  );
}

describe("UD1 — useDeferred race navigate ↔ Await resolve (§7.2 G10)", () => {
  it("UD1.1: late resolve(p1) AFTER navigate to route2 → Await shows p2's value, not p1", async () => {
    const router = createStressRouter(5);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const p1 = deferredPair<string>();
    const p2 = deferredPair<string>();

    const map = new Map<string, Promise<unknown>>([
      ["route0", p1.promise],
      ["route1", p2.promise],
    ]);

    router.usePlugin(createDeferredInjectorPlugin(map));

    await router.start("/route0");

    render(() => (
      <RouterProvider router={router}>
        <Probe data-testid="probe" />
      </RouterProvider>
    ));

    // Initially: route0 → p1 is pending → fallback visible.
    expect(screen.queryByTestId("pending")).toBeInTheDocument();
    expect(screen.queryByTestId("probe")).not.toBeInTheDocument();

    // Navigate to route1 — p2 is now the active deferred.
    await router.navigate("route1");
    await Promise.resolve();

    // Resolve p1 (stale, route0 no longer active).
    p1.resolvers.resolve("STALE-FROM-P1");
    await Promise.resolve();
    await Promise.resolve();

    // Await must STILL show pending (p2 unresolved) — the stale p1
    // resolution must NOT bleed into the active resource.
    expect(screen.queryByTestId("probe")?.textContent ?? null).not.toBe(
      "STALE-FROM-P1",
    );

    // Resolve p2 — the active deferred.
    p2.resolvers.resolve("CORRECT-FROM-P2");

    await waitFor(() => {
      expect(screen.getByTestId("probe").textContent).toBe("CORRECT-FROM-P2");
    });

    consoleError.mockRestore();
    router.stop();
  });

  it("UD1.2: 50 rapid navigate cycles with late resolves — never shows stale value", async () => {
    const router = createStressRouter(5);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const CYCLES = 50;
    const pendingResolvers: { name: string; resolvers: DeferredResolvers }[] =
      [];
    const map = new Map<string, Promise<unknown>>();

    // Pre-create deferred promises for the cycles. Each route alternation
    // gets a fresh promise so the test reflects per-nav lifetimes.
    for (let i = 0; i < CYCLES; i++) {
      const name = `route${i % 2}`;
      const d = deferredPair<string>();

      map.set(name, d.promise);
      pendingResolvers.push({ name, resolvers: d.resolvers });
    }

    router.usePlugin(createDeferredInjectorPlugin(map));
    await router.start("/route0");

    const { container } = render(() => (
      <RouterProvider router={router}>
        <Probe data-testid="cycle-probe" />
      </RouterProvider>
    ));

    const heapBefore = takeHeapSnapshot();

    // Rapid alternation: navigate → swap map promise → navigate → swap.
    // After each navigate, resolve the PREVIOUS deferred late (stale)
    // and the CURRENT one fresh. Active <Await> must always show fresh.
    for (let i = 1; i < CYCLES; i++) {
      const target = `route${i % 2}`;
      // Replace map entry for the target with a fresh promise so
      // onTransitionStart writes the new one.
      const fresh = deferredPair<string>();

      map.set(target, fresh.promise);

      await router.navigate(target).catch(() => undefined);

      // Resolve the PREVIOUS pending entry as stale.
      const stale = pendingResolvers[i - 1];

      stale.resolvers.resolve(`STALE-${i - 1}`);

      // Resolve the fresh one with a distinctive value.
      fresh.resolvers.resolve(`FRESH-${i}`);
      pendingResolvers.push({ name: target, resolvers: fresh.resolvers });
    }

    // Drain microtasks.
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }

    // The final visible value must be the LAST fresh resolution,
    // not any of the STALE-* values.
    const finalText = container.textContent;

    expect(finalText).toContain(`FRESH-${CYCLES - 1}`);

    // Defensive: no stale leak. Collect any STALE values that survived
    // into a single assertion so vitest's conditional-expect rule
    // doesn't trip on a per-iteration expect.
    const staleLeaks = Array.from({ length: CYCLES - 1 }, (_, i) =>
      finalText.includes(`STALE-${i}`) ? `STALE-${i}` : null,
    ).filter((entry): entry is string => entry !== null);

    expect(staleLeaks).toStrictEqual([]);

    forceGC();
    const heapAfter = takeHeapSnapshot();

    // 50 deferred promises × 2 (stale + fresh per cycle). Bounded — no
    // retained resource snapshots.
    expect(heapAfter - heapBefore).toBeLessThan(20 * MB);

    consoleError.mockRestore();
    router.stop();
  }, 60_000);
});
