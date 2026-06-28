import { render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, afterEach, it, expect } from "vitest";

import { createTestRouterWithADefaultRouter } from "../helpers";
import GatedErrorBoundary from "../helpers/GatedErrorBoundary.svelte";
import GatedRouteReader from "../helpers/GatedRouteReader.svelte";

import type { Router } from "@real-router/core";

// Reactive-lifecycle regression invariants (#778) — the gap the audit flagged.
// This is the svelte P1 probe ported as a permanent guard: it locks the #765
// reconnect-reconcile fix for the createSubscriber `{#if}`-gate case (the widest
// reachability in the adapter series — a login-gate around all `.current`
// readers).
describe("reactive lifecycle (#778)", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
  });

  it("P1: a {#if}-gated route.current reader is fresh after off → navigate → on", async () => {
    router = createTestRouterWithADefaultRouter();

    await router.start();
    await router.navigate("users.list");
    flushSync();

    const { rerender } = render(GatedRouteReader, {
      props: { router, show: true },
    });

    expect(screen.getByTestId("route-name").textContent).toBe("users.list");

    // Gate off — the ONLY `.current` reader unmounts, so the lazy
    // createSubscriber drops its subscription and createRouteSource disconnects.
    await rerender({ router, show: false });
    flushSync();

    expect(screen.getByTestId("off")).not.toBeNull();
    expect(screen.queryByTestId("route-name")).toBeNull();

    // Navigate while no reader is subscribed.
    await router.navigate("about");
    flushSync();

    // Gate on — a fresh reader re-subscribes → createRouteSource reconciles on
    // first subscribe → the reader shows the current route, not the stale one.
    await rerender({ router, show: true });
    flushSync();

    expect(screen.getByTestId("route-name").textContent).toBe("about");
  });

  // #765 1.2 manifestation: a navigation error that fires BEFORE a
  // RouterErrorBoundary mounts (the ordinary load order — a lazy app shell, or a
  // failed boot navigation) is invisible to a boundary that creates its error
  // source lazily on mount, AFTER the error. RouterProvider now eagerly creates
  // the per-router error source, so it captures the error from Provider mount;
  // the boundary's createDismissableError catches up (#765) and shows the
  // fallback.
  it("P2: a RouterErrorBoundary mounted AFTER a navigation error shows the fallback", async () => {
    router = createTestRouterWithADefaultRouter();

    await router.start();

    const { rerender } = render(GatedErrorBoundary, {
      props: { router, show: false },
    });

    flushSync();

    // Navigation error BEFORE the boundary mounts.
    await router.navigate("nonexistent").catch(() => {});
    flushSync();

    // Mount the boundary now (e.g. a lazily-loaded app shell).
    await rerender({ router, show: true });
    flushSync();

    expect(screen.getByTestId("fb")).not.toBeNull();
    expect(screen.getByTestId("fb").textContent).toBe("ROUTE_NOT_FOUND");
  });
});
