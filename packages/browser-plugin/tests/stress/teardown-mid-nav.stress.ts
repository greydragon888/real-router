import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { createStressRouter, noop, waitForTransitions } from "./helpers";

describe("B7.1: teardown in the middle of in-flight navigation", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
  });

  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("B7.1: unsubscribe mid-transition does not log to console.error or crash", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(noop);
    const { router, unsubscribe } = createStressRouter();

    try {
      await router.start();

      // Fire off 50 navigations and tear the plugin down after the first one resolves.
      // Any onTransitionSuccess that lands after `unsubscribe()` must not attempt
      // `#claim.write` on a released namespace — such a call would surface as a
      // console.error (thrown inside core, swallowed up the stack).
      const navPromises: Promise<unknown>[] = [];

      for (let i = 0; i < 50; i++) {
        navPromises.push(
          router
            .navigate(i % 2 === 0 ? "users.list" : "home")
            .catch((error: unknown) => {
              if ((error as { name?: string }).name !== "RouterError") {
                throw error;
              }
            }),
        );

        if (i === 25) {
          unsubscribe();
        }
      }

      await Promise.allSettled(navPromises);
      await waitForTransitions(10);

      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      router.stop();
      errorSpy.mockRestore();
    }
  });

  it("B7.1: popstate after unsubscribe is ignored (listener removed)", async () => {
    const { router, unsubscribe } = createStressRouter();

    try {
      await router.start();
      await router.navigate("users.list");

      const stateBefore = router.getState()?.name;

      unsubscribe();

      // After teardown, a popstate event must not trigger any navigation
      // because the plugin's listener was removed in `createPopstateLifecycle.teardown`.
      globalThis.dispatchEvent(
        new PopStateEvent("popstate", {
          state: { name: "home", params: {}, path: "/home" },
        }),
      );

      await waitForTransitions(10);

      expect(router.getState()?.name).toBe(stateBefore);
    } finally {
      router.stop();
    }
  });
});
