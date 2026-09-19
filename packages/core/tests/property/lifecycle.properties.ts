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
  test.prop([arbStartPath], { numRuns: NUM_RUNS.standard })(
    "start → isActive: after start(path), isActive() === true",
    async (path) => {
      const router = createFixtureRouter();

      await router.start(path);

      expect(router.isActive()).toBe(true);

      router.stop();
    },
  );

  test.prop([arbStartPath], { numRuns: NUM_RUNS.standard })(
    "start → getState: after start(path), getState() !== undefined",
    async (path) => {
      const router = createFixtureRouter();

      await router.start(path);

      expect(router.getState()).toBeDefined();

      router.stop();
    },
  );

  test.prop([arbStartPath], { numRuns: NUM_RUNS.standard })(
    "stop → isActive: after stop(), isActive() === false",
    async (path) => {
      const router = createFixtureRouter();

      await router.start(path);
      router.stop();

      expect(router.isActive()).toBe(false);
    },
  );

  test.prop([arbStartPath], { numRuns: NUM_RUNS.standard })(
    "stop clears active state: after stop(), getState() returns undefined",
    async (path) => {
      const router = createFixtureRouter();

      await router.start(path);
      router.stop();

      expect(router.getState()).toBeUndefined();
    },
  );

  test.prop([arbStartPath], { numRuns: NUM_RUNS.standard })(
    "restart restores state: after start → stop → start(samePath), the committed state identity is restored",
    async (path) => {
      const router = createFixtureRouter();

      const first = await router.start(path);
      const firstIdentity = {
        name: first.name,
        path: first.path,
        params: { ...first.params },
        context: { ...first.context },
      };

      router.stop();

      const second = await router.start(path);

      // Liveness (original assertion — kept).
      expect(router.isActive()).toBe(true);

      // Restoration: re-resolving the same path after a stop must reproduce the
      // same state identity, not a stale or corrupted one. `getState()` must
      // agree with the value returned by `start()`.
      expect(second.name).toBe(firstIdentity.name);
      expect(second.path).toBe(firstIdentity.path);
      expect(second.params).toStrictEqual(firstIdentity.params);
      expect(second.context).toStrictEqual(firstIdentity.context);
      expect(router.getState()).toStrictEqual(second);

      router.stop();
    },
  );

  test.prop([arbStartPath], { numRuns: NUM_RUNS.standard })(
    "start result is deeply frozen (state, params, transition, segments)",
    async (path) => {
      const router = createFixtureRouter();

      const state = await router.start(path);

      // Top-level state and every nested structure a consumer can reach are
      // frozen, so a misbehaving plugin or view cannot mutate committed state.
      // `state.context` is the documented exception (plugins write to it via
      // `claim.write()` post-creation), so it is deliberately NOT asserted here.
      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(state.params)).toBe(true);
      expect(Object.isFrozen(state.transition)).toBe(true);
      expect(Object.isFrozen(state.transition.segments)).toBe(true);
      expect(Object.isFrozen(state.transition.segments.activated)).toBe(true);
      expect(Object.isFrozen(state.transition.segments.deactivated)).toBe(true);

      // getState() must expose the same frozen instance.
      expect(Object.isFrozen(router.getState())).toBe(true);

      router.stop();
    },
  );

  test.prop([arbStartPath], { numRuns: NUM_RUNS.standard })(
    "double start rejects with ALREADY_STARTED",
    async (path) => {
      const router = createFixtureRouter();

      await router.start(path);

      await expect(router.start(path)).rejects.toThrow(
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
      () => router.subscribeLeave(() => {}),
      () => router.canNavigateTo("home"),
    ] as const;

    for (const method of blockedMethods) {
      expect(method).toThrow(RouterError);
      expect(method).toThrow(
        expect.objectContaining({ code: errorCodes.ROUTER_DISPOSED }),
      );
    }
  });

  it("dispose is idempotent: second call does not throw", async () => {
    const router = await createStartedRouter();

    router.dispose();

    expect(() => {
      router.dispose();
    }).not.toThrow();
  });

  it("dispose works from any state (idle, ready)", () => {
    const idleRouter = createFixtureRouter();

    expect(() => {
      idleRouter.dispose();
    }).not.toThrow();
  });
});
