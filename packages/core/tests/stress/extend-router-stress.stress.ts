import { describe, afterEach, it, expect } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import {
  createStressRouter,
  formatBytes,
  MB,
  takeHeapSnapshot,
} from "./helpers";

import type { Router } from "@real-router/core";

describe("S26: extendRouter() mass extension/removal", () => {
  let router: Router;

  afterEach(() => {
    router.stop();
    router.dispose();
  });

  it("S26.1: 500 extend/remove cycles — no leftover properties, heap stable", async () => {
    router = createStressRouter(5);
    await router.start("/route0");

    const pluginApi = getPluginApi(router);
    const before = takeHeapSnapshot();

    for (let i = 0; i < 500; i++) {
      const key = `ext_${i}`;

      const remove = pluginApi.extendRouter({
        [key]: () => i,
      });

      expect(key in router).toBe(true);

      remove();

      expect(key in router).toBe(false);
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `heap delta: ${formatBytes(delta)}`).toBeLessThan(5 * MB);
  });

  it("S26.2: 50 concurrent extensions — all accessible, all cleaned up", async () => {
    router = createStressRouter(5);
    await router.start("/route0");

    const pluginApi = getPluginApi(router);
    const removers: (() => void)[] = [];

    for (let i = 0; i < 50; i++) {
      const remove = pluginApi.extendRouter({
        [`method_${i}`]: () => i,
      });

      removers.push(remove);
    }

    for (let i = 0; i < 50; i++) {
      expect(`method_${i}` in router).toBe(true);
    }

    for (const remove of removers) {
      remove();
    }

    for (let i = 0; i < 50; i++) {
      expect(`method_${i}` in router).toBe(false);
    }
  });

  it("S26.3: conflict detection under load — PLUGIN_CONFLICT on duplicate key", async () => {
    router = createStressRouter(5);
    await router.start("/route0");

    const pluginApi = getPluginApi(router);
    let conflictCount = 0;

    const removers: (() => void)[] = [];

    for (let i = 0; i < 100; i++) {
      const key = `shared_${i % 10}`;

      try {
        const remove = pluginApi.extendRouter({ [key]: () => i });

        removers.push(remove);
      } catch (error) {
        if (
          error instanceof RouterError &&
          error.code === errorCodes.PLUGIN_CONFLICT
        ) {
          conflictCount++;
        }
      }
    }

    expect(conflictCount).toBe(90);

    for (const remove of removers) {
      remove();
    }

    for (let i = 0; i < 10; i++) {
      expect(`shared_${i}` in router).toBe(false);
    }
  });
});
