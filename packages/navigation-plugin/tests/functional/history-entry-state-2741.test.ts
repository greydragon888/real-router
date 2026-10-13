import { createRouter } from "@real-router/core";
import { afterEach, describe, expect, it } from "vitest";

import { navigationPluginFactory } from "../../src";
import { MockNavigation } from "../helpers/mockNavigation";
import {
  createMockNavigationBrowser,
  routerConfig,
} from "../helpers/testUtils";

import type { Router } from "@real-router/core";

/**
 * The Navigation API stores a structured clone of the state a navigation or
 * `updateCurrentEntry` is given, and the plugin reuses one buffer for it. The
 * mock stores a copy too, so an entry reads back the state it was written
 * with after the plugin's next write.
 */
const nameOf = (state: unknown): unknown => (state as { name?: string }).name;
const paramsOf = (state: unknown): unknown =>
  (state as { params?: unknown }).params;

let router: Router | undefined;

describe("an entry keeps the state the plugin wrote (#2741)", () => {
  afterEach(() => {
    router?.stop();
    router = undefined;
  });

  it("entries written by start() and two transitions keep their own states", async () => {
    const mock = new MockNavigation("http://localhost/home");

    router = createRouter(routerConfig, { defaultRoute: "home" });
    router.usePlugin(
      navigationPluginFactory({}, createMockNavigationBrowser(mock)),
    );
    await router.start();
    await router.navigate("users.view", { id: "42" });
    await router.navigate("users.view", { id: "7" });

    const [first, second, third] = mock.entries();

    expect(nameOf(first.getState())).toBe("home");
    expect(paramsOf(second.getState())).toStrictEqual({ id: "42" });
    expect(paramsOf(third.getState())).toStrictEqual({ id: "7" });
  });
});

describe("MockNavigation stores a copy of the state it is given (#2741)", () => {
  it("on a navigation", () => {
    const mock = new MockNavigation("http://localhost/home");
    const state = { n: 1 };

    mock.navigate("http://localhost/next", { state });
    state.n = 2;

    expect(mock.currentEntry?.getState()).toStrictEqual({ n: 1 });
  });

  it("on a write to the current entry", () => {
    const mock = new MockNavigation("http://localhost/home");
    const state = { n: 1 };

    mock.currentEntry?._setState(state);
    state.n = 2;

    expect(mock.currentEntry?.getState()).toStrictEqual({ n: 1 });
  });
});
