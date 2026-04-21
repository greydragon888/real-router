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

import { browserPluginFactory } from "@real-router/browser-plugin";

import {
  createStressRouter,
  makePopstateState,
  waitForTransitions,
  noop,
  routeConfig,
} from "./helpers";
import { createSafeBrowser } from "../../src/browser-env";

import type { Router } from "@real-router/core";

describe("B5: Browser plugin lifecycle churn", () => {
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

  it("B5.1: 100 start/stop cycles — 0 active popstate listeners after final stop", async () => {
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

  it("B5.2: 50 cycles: start → navigate×5 → stop — state correct before each stop", async () => {
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

  it("B5.3: HMR simulation — shared factory reused 20× — SharedFactoryState cleanup verified", async () => {
    const safeBrowser = createSafeBrowser(
      () => globalThis.location.pathname + globalThis.location.search,
      "browser-plugin",
    );

    const factory = browserPluginFactory({}, safeBrowser);

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

  it("B5.4: start → popstate storm×10 → stop → start → clean popstate — no deferred carryover", async () => {
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

  it("B5.5: 50 cycles — create + plugin + start + navigate + dispose — no crashes", async () => {
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
});
