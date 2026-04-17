import {
  describe,
  it,
  expect,
  afterEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { createStressRouter, noop } from "./helpers";

import type { Router, Unsubscribe } from "@real-router/core";

let router: Router;
let unsubscribe: Unsubscribe;

describe("N17 — peek/hasVisited performance under deep history", () => {
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

  it("N17.1: 1000 hasVisited calls over 100-deep history complete under 500ms", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    await router.start();

    for (let i = 0; i < 100; i++) {
      await router.navigate("users.view", { id: String(i) });
    }

    const start = Date.now();

    for (let i = 0; i < 1000; i++) {
      router.hasVisited("users.view");
    }

    const elapsed = Date.now() - start;

    // Regression guard — if each hasVisited does 100× `new URL()` + `matchPath`,
    // 1000 calls = 100K parses. Must stay under 500ms on jsdom.
    expect(elapsed).toBeLessThan(500);

    // Sanity: the route is genuinely reported as visited.
    expect(router.hasVisited("users.view")).toBe(true);
  });
});
