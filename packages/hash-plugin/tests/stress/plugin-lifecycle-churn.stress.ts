import { createRouter } from "@real-router/core";
import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";

import { hashPluginFactory } from "@real-router/hash-plugin";

import {
  createStressRouter,
  makePopstateState,
  waitForTransitions,
  noop,
  routeConfig,
} from "./helpers";
import { createSafeBrowser, safelyEncodePath } from "../../src/browser-env";
import { createHashPrefixRegex, extractHashPath } from "../../src/hash-utils";

import type { Router } from "@real-router/core";

describe("Hash Plugin Lifecycle Churn", () => {
  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(() => {
    globalThis.history.replaceState({}, "", "/");
  });

  afterAll(() => {
    (console.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
    (console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  it("100 start/stop cycles: 0 active popstate listeners after final stop", async () => {
    const { router, dispatchPopstate, unsubscribe } = createStressRouter();

    for (let i = 0; i < 100; i++) {
      await router.start();
      router.stop();
    }

    const stateAfterStop = router.getState();
    const navigateSpy = vi.spyOn(router, "navigate");

    dispatchPopstate(makePopstateState("home", {}, "/home"));
    await waitForTransitions();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(router.getState()).toStrictEqual(stateAfterStop);

    unsubscribe();
  });

  it("50 cycles: start -> navigate x5 -> stop: state correct before each stop", async () => {
    const { router, unsubscribe } = createStressRouter();

    let stateBeforeLastStop: string | undefined;

    for (let i = 0; i < 50; i++) {
      await router.start();
      await router.navigate("home").catch(noop);
      await router.navigate("users.list").catch(noop);
      await router.navigate("home").catch(noop);
      await router.navigate("users.list").catch(noop);
      await router.navigate("home").catch(noop);

      stateBeforeLastStop = router.getState()?.name;
      router.stop();
    }

    expect(stateBeforeLastStop).toBe("home");
    expect(router.isActive()).toBe(false);

    unsubscribe();
  });

  it("HMR simulation: shared factory reused 20x with hash plugin", async () => {
    const prefixRegex = createHashPrefixRegex("");
    const safeBrowser = createSafeBrowser(() => {
      const hashPath = safelyEncodePath(
        extractHashPath(globalThis.location.hash, prefixRegex),
      );

      return hashPath.includes("?")
        ? hashPath
        : hashPath + globalThis.location.search;
    }, "hash-plugin");

    const factory = hashPluginFactory({}, safeBrowser);

    let lastRouter: Router | undefined;

    for (let i = 0; i < 20; i++) {
      const r = createRouter(routeConfig, { defaultRoute: "home" });

      r.usePlugin(factory);
      await r.start();
      await r.navigate("users.list").catch(noop);
      r.stop();

      lastRouter = r;
    }

    const stateBeforePopstate = lastRouter!.getState();

    globalThis.dispatchEvent(
      new PopStateEvent("popstate", {
        state: makePopstateState("home", {}, "/home"),
      }),
    );
    await waitForTransitions();

    expect(lastRouter!.getState()).toStrictEqual(stateBeforePopstate);
  });

  it("50 full create+plugin+start+navigate+dispose cycles: no crashes", async () => {
    let completed = 0;

    for (let i = 0; i < 50; i++) {
      const { router, unsubscribe } = createStressRouter();

      await router.start();
      await router.navigate("users.list").catch(noop);
      router.stop();
      unsubscribe();

      completed++;
    }

    expect(completed).toBe(50);
  });

  it("start -> popstate storm x10 -> stop -> start -> clean popstate: no deferred carryover", async () => {
    const { router, dispatchPopstate, unsubscribe } = createStressRouter();

    await router.start();

    for (let i = 0; i < 10; i++) {
      dispatchPopstate(makePopstateState("users.list", {}, "/users/list"));
    }

    await waitForTransitions();
    router.stop();

    await router.start();

    dispatchPopstate(makePopstateState("home", {}, "/home"));
    await waitForTransitions();

    expect(router.getState()?.name).toBe("home");

    router.stop();
    unsubscribe();
  });
});
