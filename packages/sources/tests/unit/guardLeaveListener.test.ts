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

  it("passes a rejecting handler's Promise through verbatim — the HOF never re-codes it (#1435 §8)", async () => {
    const error = new Error("exit boom");
    const rejected = Promise.reject(error);

    // Attach a catch so the deliberate rejection is not an unhandled rejection;
    // the returned identity (and the rejection reason) are unaffected.
    rejected.catch(() => {});

    const listener = guardLeaveListener(() => rejected);

    const result = listener({
      route: mkState("users"),
      nextRoute: mkState("about"),
      signal: freshSignal(),
    });

    // The listener returns the SAME rejected Promise — the HOF is a pure
    // passthrough, so core (not the HOF) owns the rejection → TRANSITION_ERROR
    // contract. Any `.then` / `.catch` / re-wrap here would break identity, and
    // the rejection carries the handler's ORIGINAL error, never re-coded.
    expect(result).toBe(rejected);
    await expect(result).rejects.toBe(error);
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
