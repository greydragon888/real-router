import { test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";

import {
  createFixtureRouter,
  createStartedRouter,
  arbStartPath,
  NUM_RUNS,
} from "./helpers";

describe("start / stop / dispose Lifecycle Properties", () => {
  test.prop([arbStartPath], { numRuns: NUM_RUNS.fast })(
    "start → isActive: after start(path), isActive() === true",
    async (path) => {
      const router = createFixtureRouter();

      await router.start(path);

      expect(router.isActive()).toBe(true);

      router.stop();
    },
  );

  test.prop([arbStartPath], { numRuns: NUM_RUNS.fast })(
    "start → getState: after start(path), getState() !== undefined",
    async (path) => {
      const router = createFixtureRouter();

      await router.start(path);

      expect(router.getState()).toBeDefined();

      router.stop();
    },
  );

  test.prop([arbStartPath], { numRuns: NUM_RUNS.fast })(
    "stop → isActive: after stop(), isActive() === false",
    async (path) => {
      const router = createFixtureRouter();

      await router.start(path);
      router.stop();

      expect(router.isActive()).toBe(false);
    },
  );

  test.prop([arbStartPath], { numRuns: NUM_RUNS.fast })(
    "stop clears active state: after stop(), getState() returns undefined",
    async (path) => {
      const router = createFixtureRouter();

      await router.start(path);
      router.stop();

      expect(router.getState()).toBeUndefined();
    },
  );

  test.prop([arbStartPath], { numRuns: NUM_RUNS.fast })(
    "restart: after stop() then start(path), isActive() === true",
    async (path) => {
      const router = createFixtureRouter();

      await router.start(path);
      router.stop();
      await router.start(path);

      expect(router.isActive()).toBe(true);

      router.stop();
    },
  );

  test.prop([arbStartPath], { numRuns: NUM_RUNS.fast })(
    "double start rejects with ALREADY_STARTED",
    async (path) => {
      const router = createFixtureRouter();

      await router.start(path);

      await expect(router.start(path)).rejects.toThrowError(
        expect.objectContaining({ code: errorCodes.ROUTER_ALREADY_STARTED }),
      );

      router.stop();
    },
  );

  it("dispose → all mutating methods throw DISPOSED", async () => {
    const router = await createStartedRouter();

    router.dispose();

    const blockedMethods = [
      () => router.navigate("home"),
      () => router.navigateToDefault(),
      () => router.navigateToNotFound("/x"),
      () => router.start("/"),
      () => router.stop(),
      () => router.usePlugin(() => ({})),
      () => router.subscribe(() => {}),
      () => router.canNavigateTo("home"),
    ] as const;

    for (const method of blockedMethods) {
      expect(method).toThrowError(RouterError);
      expect(method).toThrowError(
        expect.objectContaining({ code: errorCodes.ROUTER_DISPOSED }),
      );
    }
  });

  it("dispose is idempotent: second call does not throw", async () => {
    const router = await createStartedRouter();

    router.dispose();

    expect(() => {
      router.dispose();
    }).not.toThrowError();
  });

  it("dispose works from any state (idle, ready)", () => {
    const idleRouter = createFixtureRouter();

    expect(() => {
      idleRouter.dispose();
    }).not.toThrowError();
  });
});
