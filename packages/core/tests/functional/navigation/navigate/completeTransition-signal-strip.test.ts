import { describe, beforeEach, afterEach, it, expect, vi } from "vitest";

import { createTestRouter } from "../../../helpers";

import type {
  NavigationOptions,
  PluginFactory,
  Router,
} from "@real-router/core";

/**
 * completeTransition strips the internal `opts.signal` before handing opts to
 * `sendTransitionDone` → plugin `onTransitionSuccess` (#722): the AbortSignal is
 * a navigation-internal detail, not part of the public success payload. The
 * `opts.signal === undefined ? opts : stripSignal(opts)` ternary survives
 * because no test inspects the success opts for an absent signal.
 */
let router: Router;

describe("completeTransition — opts.signal stripping (#722)", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }

    vi.restoreAllMocks();
  });

  it("removes signal from onTransitionSuccess opts when navigate was given one", async () => {
    const controller = new AbortController();
    let received: NavigationOptions | undefined;

    const plugin: PluginFactory = () => ({
      onTransitionSuccess(_toState, _fromState, opts) {
        received = opts;
      },
    });

    router.usePlugin(plugin);

    await router.navigate("users", {}, undefined, {
      signal: controller.signal,
    });

    expect(received).toBeDefined();
    // signal must be stripped from the public success payload
    expect(received && "signal" in received).toBe(false);
  });

  it("preserves the other opts fields while stripping signal", async () => {
    const controller = new AbortController();
    let received: NavigationOptions | undefined;

    router.usePlugin(() => ({
      onTransitionSuccess(_t, _f, opts) {
        received = opts;
      },
    }));

    await router.navigate("users", {}, undefined, {
      signal: controller.signal,
      reload: true,
    });

    expect(received?.reload).toBe(true);
    expect(received && "signal" in received).toBe(false);
  });
});
