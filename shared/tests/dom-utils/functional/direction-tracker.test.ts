import { afterEach, describe, expect, it, vi } from "vitest";

import { createDirectionTracker } from "../../../dom-utils";

import type { Router, State } from "@real-router/core";

type LeaveListener = (payload: {
  route: State;
  nextRoute: State;
  signal: AbortSignal;
}) => void | Promise<void>;

interface FakeRouter {
  emitLeave: (
    fromRoute: State,
    toRoute: State,
    signal?: AbortSignal,
  ) => Promise<void>;
  router: Router;
}

const makeState = (name: string): State =>
  ({
    name,
    path: `/${name}`,
    params: {},
    meta: { id: 0, params: {}, options: {} },
  }) as unknown as State;

function makeFakeRouter(): FakeRouter {
  const leaveListeners: LeaveListener[] = [];

  const router = {
    subscribeLeave(listener: LeaveListener) {
      leaveListeners.push(listener);

      return () => {
        const index = leaveListeners.indexOf(listener);

        if (index !== -1) {
          leaveListeners.splice(index, 1);
        }
      };
    },
  } as unknown as Router;

  return {
    async emitLeave(fromRoute, toRoute, signal) {
      const sig = signal ?? new AbortController().signal;
      const promises: Promise<void>[] = [];

      for (const fn of leaveListeners) {
        const result = fn({
          route: fromRoute,
          nextRoute: toRoute,
          signal: sig,
        });

        if (result !== undefined && typeof result.then === "function") {
          promises.push(result);
        }
      }

      await Promise.all(promises);
    },
    router,
  };
}

describe("createDirectionTracker", () => {
  afterEach(() => {
    delete document.documentElement.dataset.navDirection;
    vi.restoreAllMocks();
  });

  it("returns no-op when document is undefined (SSR)", () => {
    const fake = makeFakeRouter();
    const documentDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "document",
    );

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: undefined,
    });

    try {
      const tracker = createDirectionTracker(fake.router);

      expect(tracker.destroy).toBeTypeOf("function");

      tracker.destroy();
    } finally {
      if (documentDescriptor) {
        Object.defineProperty(globalThis, "document", documentDescriptor);
      }
    }
  });

  it("sets baseline data-nav-direction='forward' on install", () => {
    const fake = makeFakeRouter();

    const tracker = createDirectionTracker(fake.router);

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  it("writes 'forward' on subscribeLeave when no popstate occurred", async () => {
    const fake = makeFakeRouter();
    const tracker = createDirectionTracker(fake.router);

    await fake.emitLeave(makeState("home"), makeState("about"));

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  it("writes 'back' after popstate, then resets to 'forward' on next leave", async () => {
    const fake = makeFakeRouter();
    const tracker = createDirectionTracker(fake.router);

    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await fake.emitLeave(makeState("home"), makeState("about"));

    expect(document.documentElement.dataset.navDirection).toBe("back");

    await fake.emitLeave(makeState("about"), makeState("home"));

    expect(document.documentElement.dataset.navDirection).toBe("forward");

    tracker.destroy();
  });

  it("destroy() removes popstate listener and clears dataset attribute", async () => {
    const fake = makeFakeRouter();
    const tracker = createDirectionTracker(fake.router);

    tracker.destroy();

    expect(document.documentElement.dataset.navDirection).toBeUndefined();

    // After destroy, popstate should not affect anything.
    globalThis.dispatchEvent(new PopStateEvent("popstate"));
    await fake.emitLeave(makeState("home"), makeState("about"));

    // Dataset stays undefined because subscribeLeave was unsubscribed.
    expect(document.documentElement.dataset.navDirection).toBeUndefined();
  });
});
