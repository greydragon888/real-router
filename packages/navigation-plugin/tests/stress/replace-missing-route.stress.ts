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

describe("N16 — replaceHistoryState with missing route", () => {
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

  it("N16.1: 1000 replaceHistoryState calls to a missing route throw synchronously each time", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    await router.start();

    let thrown = 0;

    for (let i = 0; i < 1000; i++) {
      try {
        router.replaceHistoryState("non.existent.route");
      } catch {
        thrown++;
      }
    }

    await waitForTransitions();

    expect(thrown).toBe(1000);
    // Router state remains the initial one — default route "/" → index.
    expect(router.getState()?.name).toBe("index");
  });
});
