import { describe, it, expect } from "vitest";

import { events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import {
  createStressRouter,
  formatBytes,
  MB,
  takeHeapSnapshot,
} from "./helpers";

import type { PluginFactory } from "@real-router/core";

const emptyPluginFactory: PluginFactory = () => ({});

const extendRouterFactory: PluginFactory = (r) => {
  const api = getPluginApi(r);
  const removeExtension = api.extendRouter({
    stressExt: () => {
      /* noop */
    },
  });

  return { teardown: removeExtension };
};

const addInterceptorFactory: PluginFactory = (r) => {
  const api = getPluginApi(r);
  const removeInterceptor = api.addInterceptor(
    "forwardState",
    (next, name, params) => next(name, params),
  );

  return { teardown: removeInterceptor };
};

const eventListenerFactory: PluginFactory = (r) => {
  const api = getPluginApi(r);
  const unsubs = [
    api.addEventListener(events.TRANSITION_START, () => {
      /* noop */
    }),
    api.addEventListener(events.TRANSITION_SUCCESS, () => {
      /* noop */
    }),
    api.addEventListener(events.TRANSITION_ERROR, () => {
      /* noop */
    }),
    api.addEventListener(events.TRANSITION_CANCEL, () => {
      /* noop */
    }),
    api.addEventListener(events.ROUTER_START, () => {
      /* noop */
    }),
    api.addEventListener(events.ROUTER_STOP, () => {
      /* noop */
    }),
  ];

  return {
    teardown() {
      for (const unsub of unsubs) {
        unsub();
      }
    },
  };
};

describe("S3. Plugin lifecycle memory leaks", () => {
  it("should not leak memory during 6000 usePlugin/unsubscribe cycles", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 6000; i++) {
      const unsub = router.usePlugin(emptyPluginFactory);

      unsub();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(0.8 * MB);

    router.stop();
    router.dispose();
  });

  it("should remove router extensions and not leak memory during 4000 extendRouter cycles", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 4000; i++) {
      const unsub = router.usePlugin(extendRouterFactory);

      unsub();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect("stressExt" in router).toBe(false);
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(0.9 * MB);

    router.stop();
    router.dispose();
  });

  it("should clean up interceptor chain and not leak memory during 3000 addInterceptor cycles", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 3000; i++) {
      const unsub = router.usePlugin(addInterceptorFactory);

      unsub();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(0.5 * MB);

    router.stop();
    router.dispose();
  });

  it("should remove all event listeners after 2000 plugins × 6 addEventListener cycles", async () => {
    const router = createStressRouter(5);

    await router.start("/route0");

    const before = takeHeapSnapshot();

    for (let i = 0; i < 2000; i++) {
      const unsub = router.usePlugin(eventListenerFactory);

      unsub();
    }

    const after = takeHeapSnapshot();
    const delta = after - before;

    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(1 * MB);

    router.stop();
    router.dispose();
  });
});
