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

describe("N18 — base-prefix rapid succession", () => {
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

  it("N18.1: 50 navigate events under base='/app' stay within the base path", async () => {
    const result = createStressRouter({ base: "/app" });

    router = result.router;
    unsubscribe = result.unsubscribe;

    const { mockNav } = result;

    await router.start("/app/home");

    const targets = [
      "/app/users/list",
      "/app/users/view/1",
      "/app/home",
      "/app/users/list",
    ];

    for (let i = 0; i < 50; i++) {
      const target = targets[i % targets.length];

      mockNav.navigate(`http://localhost${target}`);
    }

    await waitForTransitions();

    const state = router.getState();

    expect(state).toBeDefined();
    // State.path must be the unprefixed route path — base is stripped.
    expect(state?.path).not.toContain("/app");
    expect(["/users/list", "/users/view/1", "/home"]).toContain(state?.path);
  });
});
