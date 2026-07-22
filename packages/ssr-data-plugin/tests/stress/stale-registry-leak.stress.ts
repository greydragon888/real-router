import { createRouter } from "@real-router/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { invalidate, ssrDataPluginFactory } from "../../src";
import { clearStale, isStale, markStale } from "../../src/shared-ssr";

import type { DataLoaderFactoryMap } from "../../src";

const noop = (): void => undefined;

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
];

describe("Stale registry leak budget", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("10000 invalidate→navigate cycles: per-router Set stays singleton (no monotonic growth)", async () => {
    // Each iteration: invalidate() bumps the per-router `Set<namespace>`,
    // then the navigate's leave handler runs the loader and clears the
    // flag. After every cycle the set should be empty (isStale === false).
    // A latent bug — e.g. a Set that accumulated namespaces faster than
    // they were cleared — would surface as `isStale === true` even after
    // a successful navigation, or as a Set-size assertion drift on a
    // long run.
    const loaders: DataLoaderFactoryMap = {
      "users.profile": () => (params) => ({ id: params.id }),
    };

    const router = createRouter(routes, { defaultRoute: "home" });

    router.usePlugin(ssrDataPluginFactory(loaders));
    await router.start("/users/seed");

    const sampledFlags: { i: number; stale: boolean }[] = [];

    for (let i = 0; i < 10_000; i++) {
      invalidate(router, "data");

      // Same-route reload — guarantees the leave handler fires and the
      // loader writes data (which is the only branch that clears the
      // stale flag).
      await router.navigate("users.profile", { id: `i${i}` }, undefined, {
        reload: true,
      });

      // Sample every 1000th iteration into an array, then assert once
      // outside the loop. Vitest's `no-conditional-expect` rule
      // requires assertions be unconditional — folding the spot-check
      // into a captured projection satisfies that without losing the
      // signal (a regression that re-arms the flag would land on at
      // least one sampled point).
      if (i % 1000 === 0) {
        sampledFlags.push({ i, stale: isStale(router, "data") });
      }
    }

    expect(sampledFlags.every(({ stale }) => !stale)).toBe(true);
    expect(isStale(router, "data")).toBe(false);

    router.stop();
  });

  it("1000 markStale → leave-handler clear → clearStale cycles: Set never accumulates", async () => {
    // Lower-level loop that exercises the staleRegistry primitives
    // without going through the navigation pipeline. Set behaviour is
    // O(1) amortised — the assertion is about correctness, not perf:
    // after every cycle `isStale` must be false.
    const router = createRouter(routes, { defaultRoute: "home" });

    for (let i = 0; i < 1000; i++) {
      markStale(router, "data");

      expect(isStale(router, "data")).toBe(true);

      // Two paths that should both leave the set empty: explicit clear
      // (the path the plugin uses after a successful loader write) and
      // a no-op clear on an already-empty set.
      clearStale(router, "data");

      expect(isStale(router, "data")).toBe(false);

      clearStale(router, "data");

      expect(isStale(router, "data")).toBe(false);
    }

    router.stop();
  });
});
