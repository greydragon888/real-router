import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";

import { errorCodes, RouterError, UNKNOWN_ROUTE } from "@real-router/core";

import { createFixtureRouter, createStartedRouter, NUM_RUNS } from "./helpers";

import type { PluginFactory } from "@real-router/core";

describe("navigateToNotFound Properties", () => {
  test.prop([fc.string({ minLength: 0, maxLength: 50 }).map((s) => `/${s}`)], {
    numRuns: NUM_RUNS.standard,
  })("state name is UNKNOWN_ROUTE", async (path) => {
    const router = await createStartedRouter();

    const state = router.navigateToNotFound(path);

    expect(state.name).toBe(UNKNOWN_ROUTE);

    router.stop();
  });

  test.prop([fc.string({ minLength: 0, maxLength: 50 }).map((s) => `/${s}`)], {
    numRuns: NUM_RUNS.standard,
  })("params is empty object", async (path) => {
    const router = await createStartedRouter();

    const state = router.navigateToNotFound(path);

    expect(state.params).toStrictEqual({});

    router.stop();
  });

  test.prop([fc.string({ minLength: 0, maxLength: 50 }).map((s) => `/${s}`)], {
    numRuns: NUM_RUNS.standard,
  })("path is preserved", async (path) => {
    const router = await createStartedRouter();

    const state = router.navigateToNotFound(path);

    expect(state.path).toBe(path);

    router.stop();
  });

  it("navigateToNotFound is synchronous (returns State, not Promise)", async () => {
    const router = await createStartedRouter();

    const result = router.navigateToNotFound("/unknown");

    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof result.name).toBe("string");

    router.stop();
  });

  test.prop([fc.string({ minLength: 0, maxLength: 50 }).map((s) => `/${s}`)], {
    numRuns: NUM_RUNS.standard,
  })(
    "getState consistency: getState().name === UNKNOWN_ROUTE after call",
    async (path) => {
      const router = await createStartedRouter();

      router.navigateToNotFound(path);

      expect(router.getState()!.name).toBe(UNKNOWN_ROUTE);

      router.stop();
    },
  );

  it("throws ROUTER_NOT_STARTED when router is not started", () => {
    const router = createFixtureRouter();

    expect(() => {
      router.navigateToNotFound("/unknown");
    }).toThrow(RouterError);

    expect(() => {
      router.navigateToNotFound("/unknown");
    }).toThrow(
      expect.objectContaining({ code: errorCodes.ROUTER_NOT_STARTED }),
    );
  });

  it("plugins receive onTransitionSuccess after navigateToNotFound", async () => {
    const router = createFixtureRouter();

    await router.start("/");

    let successCalled = false;
    let receivedReplace: boolean | undefined;

    const plugin: PluginFactory = () => ({
      onTransitionSuccess(_toState, _fromState, opts) {
        successCalled = true;
        receivedReplace = opts?.replace;
      },
    });

    router.usePlugin(plugin);

    router.navigateToNotFound("/unknown");

    expect(successCalled).toBe(true);
    expect(receivedReplace).toBe(true);

    router.stop();
  });

  it("plugins do NOT receive onTransitionStart from navigateToNotFound", async () => {
    const router = createFixtureRouter();

    await router.start("/");

    let startCalled = false;

    const plugin: PluginFactory = () => ({
      onTransitionStart() {
        startCalled = true;
      },
    });

    router.usePlugin(plugin);

    router.navigateToNotFound("/unknown");

    expect(startCalled).toBe(false);

    router.stop();
  });
});
