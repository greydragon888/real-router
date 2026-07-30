import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, it, expect, vi } from "vitest";

import {
  getRouteFromEvent,
  updateBrowserState,
  createUpdateBrowserState,
} from "../../../src/browser-env";

import type { Browser } from "../../../src/browser-env";
import type { State } from "@real-router/core";

function makeFakeBrowser(location = "/"): Browser {
  return {
    pushState: vi.fn(),
    replaceState: vi.fn(),
    addPopstateListener: vi.fn(() => () => {}),
    addHashChangeListener: vi.fn(() => () => {}),
    getLocation: () => location,
    getHash: () => "",
  };
}

function makePopStateEvent(state: unknown): PopStateEvent {
  return { state } as PopStateEvent;
}

describe("getRouteFromEvent", () => {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "users", path: "/users" },
  ]);
  const api = getPluginApi(router);

  it("synthesizes a State from a valid history.state via api.makeState", () => {
    const evt = makePopStateEvent({
      name: "users",
      params: {},
      path: "/users",
    });

    const matched = getRouteFromEvent(evt, api, "/");

    expect(matched).toMatchObject({ name: "users", path: "/users" });
  });

  it("falls back to api.matchPath(location) when history.state is not a router state", () => {
    const evt = makePopStateEvent(null);

    const matched = getRouteFromEvent(evt, api, "/users");

    expect(matched).toMatchObject({ name: "users" });
  });

  it("returns undefined when neither history.state nor the location match", () => {
    const evt = makePopStateEvent(undefined);

    expect(getRouteFromEvent(evt, api, "/nope")).toBeUndefined();
  });

  it("resolves a HashChangeEvent (no history.state) via api.matchPath(location) (#759)", () => {
    // A hashchange event has no `state` property at all — the `"state" in evt`
    // guard must skip the makeState branch and fall back to matchPath.
    const evt = {} as HashChangeEvent;

    const matched = getRouteFromEvent(evt, api, "/users");

    expect(matched).toMatchObject({ name: "users" });
  });
});

describe("updateBrowserState", () => {
  const state = {
    name: "users",
    params: { id: "1" },
    path: "/users",
  } as unknown as State;

  it("pushes a {name, params, path} projection when replace is false", () => {
    const browser = makeFakeBrowser();

    updateBrowserState(state, "/users", false, browser);

    expect(browser.pushState).toHaveBeenCalledWith(
      { name: "users", params: { id: "1" }, path: "/users" },
      "/users",
    );
    expect(browser.replaceState).not.toHaveBeenCalled();
  });

  it("replaces instead of pushing when replace is true", () => {
    const browser = makeFakeBrowser();

    updateBrowserState(state, "/users", true, browser);

    expect(browser.replaceState).toHaveBeenCalledWith(
      { name: "users", params: { id: "1" }, path: "/users" },
      "/users",
    );
    expect(browser.pushState).not.toHaveBeenCalled();
  });
});

describe("createUpdateBrowserState", () => {
  const stateA = {
    name: "a",
    params: {},
    search: {},
    path: "/a",
  } as unknown as State;
  const stateB = {
    name: "b",
    params: {},
    search: {},
    path: "/b",
  } as unknown as State;

  it("pushes and replaces through the same closure", () => {
    const update = createUpdateBrowserState();
    // The closure reuses one buffer, so snapshot the projection at call time.
    const calls: { method: string; state: unknown; url: string }[] = [];
    const browser = {
      ...makeFakeBrowser(),
      pushState: (historyState: unknown, url: string) => {
        calls.push({
          method: "push",
          state: { ...(historyState as object) },
          url,
        });
      },
      replaceState: (historyState: unknown, url: string) => {
        calls.push({
          method: "replace",
          state: { ...(historyState as object) },
          url,
        });
      },
    };

    update(stateA, "/a", false, browser);
    update(stateB, "/b", true, browser);

    expect(calls).toStrictEqual([
      {
        method: "push",
        state: { name: "a", params: {}, search: {}, path: "/a" },
        url: "/a",
      },
      {
        method: "replace",
        state: { name: "b", params: {}, search: {}, path: "/b" },
        url: "/b",
      },
    ]);
  });

  it("reuses one mutable buffer across calls (hot-path allocation guard)", () => {
    const update = createUpdateBrowserState();
    const captured: unknown[] = [];
    const browser = {
      ...makeFakeBrowser(),
      pushState: (historyState: unknown) => {
        captured.push(historyState);
      },
    };

    update(stateA, "/a", false, browser);
    update(stateB, "/b", false, browser);

    expect(captured[0]).toBe(captured[1]);
    // The buffer now holds the LAST written projection — callers rely on
    // browsers structured-cloning synchronously inside pushState.
    expect(captured[0]).toMatchObject({ name: "b", path: "/b" });
  });
});
