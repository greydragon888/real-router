import { describe, it, expect, vi } from "vitest";

import { guardLeaveListener } from "../../src/guardLeaveListener.js";

import type { State } from "@real-router/core";

const mkState = (name: string): State => ({ name }) as unknown as State;

const freshSignal = (): AbortSignal => new AbortController().signal;

const abortedSignal = (): AbortSignal => {
  const controller = new AbortController();

  controller.abort();

  return controller.signal;
};

describe("guardLeaveListener", () => {
  it("skips a same-name navigation by default (skipSameRoute)", () => {
    const handler = vi.fn();
    const listener = guardLeaveListener(handler);

    void listener({
      route: mkState("users"),
      nextRoute: mkState("users"),
      signal: freshSignal(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("fires a same-name navigation when skipSameRoute is false", () => {
    const handler = vi.fn();
    const listener = guardLeaveListener(handler, { skipSameRoute: false });
    const ctx = {
      route: mkState("users"),
      nextRoute: mkState("users"),
      signal: freshSignal(),
    };

    void listener(ctx);

    expect(handler).toHaveBeenCalledWith(ctx);
  });

  it("skips when the signal is already aborted (reentrant-abort pre-check)", () => {
    const handler = vi.fn();
    const listener = guardLeaveListener(handler);

    void listener({
      route: mkState("users"),
      nextRoute: mkState("about"),
      signal: abortedSignal(),
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it("passes through to the handler on a genuine departure", () => {
    const handler = vi.fn();
    const listener = guardLeaveListener(handler);
    const ctx = {
      route: mkState("users"),
      nextRoute: mkState("about"),
      signal: freshSignal(),
    };

    void listener(ctx);

    expect(handler).toHaveBeenCalledWith(ctx);
  });

  it("returns the handler's Promise so the transition blocks (passthrough)", () => {
    const promise = Promise.resolve();
    const listener = guardLeaveListener(() => promise);

    const result = listener({
      route: mkState("users"),
      nextRoute: mkState("about"),
      signal: freshSignal(),
    });

    expect(result).toBe(promise);
  });

  it("returns undefined (does not call the handler) when a guard skips", () => {
    const listener = guardLeaveListener(() => Promise.resolve());

    const result = listener({
      route: mkState("users"),
      nextRoute: mkState("users"),
      signal: freshSignal(),
    });

    expect(result).toBeUndefined();
  });
});
