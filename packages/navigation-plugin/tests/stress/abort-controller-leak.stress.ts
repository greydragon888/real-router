import { getLifecycleApi } from "@real-router/core/api";
import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { createStressRouter, waitForTransitions, noop } from "./helpers";

import type { Router, Unsubscribe } from "@real-router/core";

let router: Router;
let unsubscribe: Unsubscribe;

describe("N19 — AbortController leak check", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
  });

  afterEach(() => {
    router.stop();
    unsubscribe();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("N19.1: 500 async navigations with aborts do not retain orphan AbortControllers", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    await router.start();

    // Async guard makes each navigate cancellable.
    getLifecycleApi(router).addActivateGuard(
      "users.view",
      () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 5);
        }),
    );

    for (let i = 0; i < 500; i++) {
      router.navigate("users.view", { id: String(i) }).catch(() => {});
    }

    await waitForTransitions(100);

    // If every navigation had left an orphan AbortController alive, the final
    // navigation's signal would be aborted by the prior one's cleanup. We
    // verify the last navigation can still complete successfully.
    const state = await router.navigate("home").catch(() => null);

    expect(state).not.toBeNull();
    expect(router.getState()?.name).toBe("home");
  });
});
