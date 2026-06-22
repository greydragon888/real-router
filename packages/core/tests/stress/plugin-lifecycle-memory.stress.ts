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

    // Throughput guard: emptyPluginFactory registers no interceptor/extension/
    // listener, so there is almost no router-side surface to accumulate even if
    // unsub were a no-op (thin reachable surface). Genuine reachable-leak
    // detection lives in the addInterceptor test below.
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

    // `"stressExt" in router === false` is the discriminating cleanup invariant
    // (a skipped teardown leaves the extension on the instance). The heap line is
    // secondary: a fully-broken teardown would actually CRASH on the 2nd cycle
    // (PLUGIN_CONFLICT on the duplicate key), so reaching 4000 cycles already
    // proves per-cycle cleanup ran.
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

    // GENUINE reachable-leak guard (mutationally validated 2026-06-22): a skipped
    // removeInterceptor retains every interceptor in the chain (reachable via the
    // persistent router), no hard cap. Measured: healthy ~106 KB, leak (skip
    // unsub, 3000 interceptors) ~1.7 MB. Threshold 0.5 MB sits ~4.8x above
    // healthy and ~3.4x below the leak — discriminating on both sides.
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

    // After 2000×6 add/remove cycles the event system is still intact: a fresh
    // listener fires exactly once on the next navigation (discriminates an
    // emitter corrupted by the churn).
    let fired = 0;
    const api = getPluginApi(router);
    const unsub = api.addEventListener(events.TRANSITION_SUCCESS, () => {
      fired++;
    });

    await router.navigate("route1");
    unsub();

    expect(fired).toBe(1);

    // Heap is a throughput guard: EventEmitter caps at 10k listeners/event and
    // the closures are noops, so a removal-leak is hard-capped below any MB
    // threshold; listener-removal correctness is covered by the addEventListener
    // functional suite.
    expect(delta, `Heap grew by ${formatBytes(delta)}`).toBeLessThan(1 * MB);

    router.stop();
    router.dispose();
  });
});
