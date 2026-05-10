import { getLifecycleApi } from "@real-router/core/api";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { createErrorSource } from "@real-router/sources";

import { createStressRouter, takeHeapSnapshot, MB } from "./helpers";

import type { Router } from "@real-router/core";

describe("S7: createErrorSource — error storm", () => {
  let router: Router;

  beforeEach(async () => {
    router = createStressRouter();
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("S7.1: 500 consecutive failed navigations — version monotonicity holds", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("admin.settings", () => () => false);
    lifecycle.addActivateGuard("admin.dashboard", () => () => false);

    const source = createErrorSource(router);
    const versions: number[] = [];

    for (let i = 0; i < 500; i++) {
      await router
        .navigate(i % 2 === 0 ? "admin.settings" : "admin.dashboard")
        .catch(() => {
          // expected — guard rejects
        });
      versions.push(source.getSnapshot().version);
    }

    // Strictly monotonic — no version may repeat or decrease, even under
    // load. Loose `>= prev` would silently mask a stuck `version` counter.
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i]).toBeGreaterThan(versions[i - 1]);
    }

    expect(versions.at(-1)).toBe(500);
  });

  it("S7.2: alternating error/success cycles — snapshot reference recycles correctly", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("admin.settings", () => () => false);

    const source = createErrorSource(router);

    for (let i = 0; i < 200; i++) {
      // First, fail to admin.settings — snapshot has error
      await router.navigate("admin.settings").catch(() => {});

      expect(source.getSnapshot().error).not.toBeNull();

      // Then success to home → snapshot resets to {error: null, ...}
      await router.navigate("about").catch(() => {});
      await router.navigate("users.list");

      expect(source.getSnapshot().error).toBeNull();
    }

    // Final state: error=null because the last hop was a success.
    expect(source.getSnapshot().error).toBeNull();
  });

  it("S7.3: subscribe N listeners, fire 200 errors, listeners count notifications correctly", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("admin.settings", () => () => false);

    const source = createErrorSource(router);
    const N = 50;
    const counts = Array.from({ length: N }).fill(0) as number[];
    const unsubs = Array.from({ length: N }, (_, i) =>
      source.subscribe(() => {
        counts[i]++;
      }),
    );

    for (let i = 0; i < 200; i++) {
      await router.navigate("admin.settings").catch(() => {});
    }

    for (const unsub of unsubs) {
      unsub();
    }

    // Each listener saw exactly one notification per emitted error.
    for (const c of counts) {
      expect(c).toBe(200);
    }
  });

  it("S7.4: rapid create/destroy of (non-cached) ErrorSource does not leak", async () => {
    const lifecycle = getLifecycleApi(router);

    lifecycle.addActivateGuard("admin.settings", () => () => false);

    const baseline = takeHeapSnapshot();

    for (let cycle = 0; cycle < 100; cycle++) {
      const source = createErrorSource(router);

      await router.navigate("admin.settings").catch(() => {});
      source.destroy();
    }

    const after = takeHeapSnapshot();

    expect(after - baseline).toBeLessThan(MB);
  });
});
