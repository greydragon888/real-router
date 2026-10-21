import { createRouter } from "@real-router/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { invalidate, ssrDataPluginFactory } from "../../src";
import { clearStaleMark, markStale, staleMark } from "../../src/shared-ssr";

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

  it("10000 invalidate→navigate cycles: the per-router registry never accumulates", async () => {
    // Each iteration: invalidate() records a mark in the per-router
    // registry, then the navigate's leave handler runs the loader and its
    // commit clears the flag. After every cycle the namespace should not
    // be stale. A latent bug — e.g. a registry that accumulated marks
    // faster than they were cleared — would surface as a stale namespace
    // even after a successful navigation.
    const loaders: DataLoaderFactoryMap = {
      "users.profile":
        () =>
        ({ params }) => ({ id: params.id }),
    };

    const router = createRouter(routes, { defaultRoute: "home" });

    router.usePlugin(ssrDataPluginFactory(loaders));
    await router.start("/users/seed");

    const sampledFlags: { i: number; stale: boolean }[] = [];

    for (let i = 0; i < 10_000; i++) {
      invalidate(router, "data");

      // Same-route reload — guarantees the leave handler fires and the
      // loader writes data, so the commit carries a refresh (the only
      // branch that clears the stale flag).
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
        sampledFlags.push({
          i,
          stale: staleMark(router, "data") !== undefined,
        });
      }
    }

    expect(sampledFlags.every(({ stale }) => !stale)).toBe(true);
    expect(staleMark(router, "data")).toBeUndefined();

    router.stop();
  });

  it("1000 markStale → clearStaleMark cycles: the registry never accumulates", async () => {
    // Lower-level loop that exercises the staleRegistry primitives
    // without going through the navigation pipeline — the assertion is
    // about correctness, not perf: after every cycle the namespace must
    // not be stale.
    const router = createRouter(routes, { defaultRoute: "home" });

    for (let i = 0; i < 1000; i++) {
      markStale(router, "data");

      const mark = staleMark(router, "data");

      expect(mark).toBeDefined();

      // Two paths that should both leave the namespace clear: a clear with
      // the latest mark (the path a committed refresh takes) and a no-op
      // clear on an already-clear namespace.
      clearStaleMark(router, "data", mark ?? Number.NaN);

      expect(staleMark(router, "data")).toBeUndefined();

      clearStaleMark(router, "data", mark ?? Number.NaN);

      expect(staleMark(router, "data")).toBeUndefined();
    }

    router.stop();
  });
});
