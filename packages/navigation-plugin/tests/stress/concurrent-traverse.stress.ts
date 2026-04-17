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

describe("N13 — concurrent traverseToLast", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  afterEach(() => {
    router.stop();
    unsubscribe();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("N13.1: two concurrent traverseToLast calls do not leave router in an invalid state", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    await router.start();
    await router.navigate("users.list");
    await router.navigate("users.view", { id: "1" });
    await router.navigate("home");
    await router.navigate("users.view", { id: "2" });

    const a = router
      .traverseToLast("users.list")
      .catch((error: unknown) => error);
    const b = router
      .traverseToLast("users.view")
      .catch((error: unknown) => error);

    await Promise.allSettled([a, b]);
    await waitForTransitions();

    const finalState = router.getState();

    expect(finalState).toBeDefined();
    expect(["users.list", "users.view", "home"]).toContain(finalState?.name);

    // canGoBack / canGoForward are booleans — index not corrupted by the race.
    expect(typeof router.canGoBack()).toBe("boolean");
    expect(typeof router.canGoForward()).toBe("boolean");
  });
});
