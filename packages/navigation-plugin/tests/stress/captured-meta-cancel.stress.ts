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

describe("N14 — capturedMeta cleanup under cancel storm", () => {
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

  it("N14.1: capturedMeta is cleared after a storm of cancelled async transitions", async () => {
    const result = createStressRouter();

    router = result.router;
    unsubscribe = result.unsubscribe;

    await router.start();

    // Install a slow async guard so every navigate can be cancelled by the next.
    getLifecycleApi(router).addActivateGuard(
      "users.list",
      () => () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => {
            resolve(true);
          }, 30);
        }),
    );

    const promises: Promise<unknown>[] = [];

    for (let i = 0; i < 40; i++) {
      promises.push(
        router
          .navigate(i % 2 === 0 ? "users.list" : "home")
          .catch((error: unknown) => error),
      );
    }

    await Promise.allSettled(promises);
    await waitForTransitions(150);

    // Final navigation drives meta to a known-good value. If capturedMeta
    // had been leaked from a cancelled transition, its `navigationType`
    // would be stale (e.g., a "reload" flag from an aborted call).
    await router.navigate("users.view", { id: "42" });

    const meta = router.getState()?.context.navigation;

    expect(meta).toBeDefined();
    // Targeted navigate(name, params) with no replace/reload flags → "push"
    // exactly. A weaker `.toContain([...valid types])` would silently accept
    // stale meta leaked from a cancelled transition.
    expect(meta!.navigationType).toBe("push");
    expect(meta!.direction).toBe("forward");
    expect(meta!.userInitiated).toBe(false);
  });
});
