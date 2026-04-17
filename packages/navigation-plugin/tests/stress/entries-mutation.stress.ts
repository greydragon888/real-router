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

describe("N15 — entries() array mutation safety", () => {
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

  it("N15.1: plugin does not mutate the array returned by browser.entries()", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    await router.start();
    await router.navigate("users.list");
    await router.navigate("users.view", { id: "1" });

    // Snapshot the browser's entries array to watch for in-place mutation.
    const snapshot = result.browser.entries();
    const snapshotCopy = [...snapshot];

    // Drive plugin-level extensions that traverse entries.
    router.hasVisited("users.list");
    router.getVisitedRoutes();
    router.getRouteVisitCount("users.view");
    router.peekBack();
    router.peekForward();
    router.canGoBack();
    router.canGoForward();
    router.canGoBackTo("users.list");

    await waitForTransitions();

    expect(snapshot).toHaveLength(snapshotCopy.length);

    for (const [i, element] of snapshotCopy.entries()) {
      expect(snapshot[i]).toBe(element);
    }
  });
});
