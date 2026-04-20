import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";

let router: Router;
let api: PluginApi;

describe("getPluginApi().emitTransitionError()", () => {
  beforeEach(() => {
    router = createTestRouter();
    api = getPluginApi(router);
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  it("delivers the error to $$error event listeners", async () => {
    const listener = vi.fn();

    await router.start("/home");
    api.addEventListener("$$error", listener);

    const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, { path: "/oops" });

    api.emitTransitionError(err);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(undefined, router.getState(), err);
  });

  it("delivers the error to Plugin.onTransitionError hook", async () => {
    const onTransitionError = vi.fn();

    router.usePlugin(() => ({
      onTransitionError,
    }));
    await router.start("/home");

    const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, { path: "/oops" });

    api.emitTransitionError(err);

    expect(onTransitionError).toHaveBeenCalledTimes(1);
    expect(onTransitionError).toHaveBeenCalledWith(
      undefined,
      router.getState(),
      err,
    );
  });

  it("uses the current router state as fromState", async () => {
    const listener = vi.fn();

    api.addEventListener("$$error", listener);

    await router.start("/home");
    await router.navigate("users");

    const currentState = router.getState();
    const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, { path: "/x" });

    api.emitTransitionError(err);

    expect(listener).toHaveBeenCalledWith(undefined, currentState, err);
  });

  it("works before router.start() — fromState is undefined", () => {
    const listener = vi.fn();

    api.addEventListener("$$error", listener);

    const err = new RouterError(errorCodes.ROUTE_NOT_FOUND, { path: "/y" });

    api.emitTransitionError(err);

    expect(listener).toHaveBeenCalledWith(undefined, undefined, err);
  });

  it("throws ROUTER_DISPOSED when called on a disposed router", () => {
    router.dispose();

    const err = new Error("boom");

    expect(() => {
      api.emitTransitionError(err);
    }).toThrow(RouterError);
  });

  it("does not corrupt router state or FSM — subsequent navigation still works", async () => {
    await router.start("/home");

    api.emitTransitionError(new Error("boom"));

    const state = await router.navigate("users");

    expect(state.name).toBe("users");
    expect(router.isActive()).toBe(true);
  });
});
