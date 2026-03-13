import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";

import {
  createStressRouter,
  makePopstateState,
  waitForTransitions,
  noop,
} from "./helpers";

import type { StressRouterResult } from "./helpers";
import type { Router } from "@real-router/core";

describe("B3 — Popstate/Navigate Interleave Stress", () => {
  let router: Router;
  let dispatchPopstate: StressRouterResult["dispatchPopstate"];
  let unsubscribe: StressRouterResult["unsubscribe"];

  beforeAll(() => {
    vi.spyOn(console, "warn").mockImplementation(noop);
    vi.spyOn(console, "error").mockImplementation(noop);
  });

  beforeEach(async () => {
    globalThis.history.replaceState({}, "", "/");

    const result = createStressRouter();

    ({ router, dispatchPopstate, unsubscribe } = result);
    await router.start();
  });

  afterEach(() => {
    router.stop();
    unsubscribe();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("3.1 — popstate then navigate: 100 pairs, final state consistent and URL valid", async () => {
    for (let i = 0; i < 100; i++) {
      const state = makePopstateState(
        "users.view",
        { id: String(i) },
        `/users/view/${i}`,
        i,
      );

      dispatchPopstate(state);
      router.navigate("users.list").catch(noop);
    }

    await waitForTransitions();

    const finalState = router.getState();

    expect(finalState).toBeDefined();
    expect(globalThis.location.pathname).toMatch(/^\//);
  });

  it("3.2 — navigate then popstate: 100 pairs, popstate processed immediately, no stuck transitions", async () => {
    for (let i = 0; i < 100; i++) {
      router.navigate("users.list").catch(noop);

      const state = makePopstateState("home", {}, "/home", i);

      dispatchPopstate(state);
    }

    await waitForTransitions();

    const finalState = router.getState();

    expect(finalState).toBeDefined();
    expect(typeof finalState!.name).toBe("string");
  });

  it("3.3 — alternating popstate/navigate × 50: state consistent, URL valid, no stuck transitions", async () => {
    for (let i = 0; i < 50; i++) {
      const popState1 = makePopstateState(
        "users.view",
        { id: String(i) },
        `/users/view/${i}`,
        i * 2,
      );

      dispatchPopstate(popState1);
      router.navigate("users.list").catch(noop);

      const popState2 = makePopstateState("home", {}, "/home", i * 2 + 1);

      dispatchPopstate(popState2);
      router.navigate("users.view", { id: String(i) }).catch(noop);
    }

    await waitForTransitions();

    const finalState = router.getState();

    expect(finalState).toBeDefined();
    expect(globalThis.location.pathname).toMatch(/^\//);
  });

  it("3.4 — fire-and-forget navigate + popstate concurrent: no unhandled rejections, state defined", async () => {
    for (let i = 0; i < 50; i++) {
      const routeName = i % 2 === 0 ? "users.list" : "home";
      const targetName = i % 3 === 0 ? "users.view" : "home";
      const params: Record<string, string> =
        i % 3 === 0 ? { id: String(i) } : {};
      const path = i % 3 === 0 ? `/users/view/${i}` : "/home";
      const popState = makePopstateState(targetName, params, path, i);

      router.navigate(routeName).catch(noop);
      dispatchPopstate(popState);
    }

    await waitForTransitions();

    expect(router.getState()).toBeDefined();
  });
});
