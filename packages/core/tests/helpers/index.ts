import { DEFAULT_TRANSITION } from "../../src/constants";

import type { Params, State } from "@real-router/core";

export { createTestRouter } from "./testRouters";

export function pickRouteIdentity(
  obj?: State,
): Pick<State, "name" | "params" | "path"> | undefined {
  if (!obj) {
    return;
  }

  return {
    name: obj.name,
    params: obj.params,
    path: obj.path,
  };
}

// Builds a bare frozen-shaped State for unit tests. Since RFC-4 M2 (#1548) the
// per-State `stateMetaStore` WeakMap is gone — ownership is read from the live
// matcher by `state.name` — so there is no per-State meta to attach here. Tests
// that need `getTransitionPath` to see a route's param-source map use a real
// router (its `getMetaForState`), not a hand-built state.
export const makeState = (name: string, params: Params = {}): State => {
  return {
    name,
    path: `/${name.replaceAll(".", "/")}`,
    params,
    search: {},
    transition: DEFAULT_TRANSITION,
    context: {},
  };
};

/**
 * Runs `action` (a fire-and-forget navigation that returns a promise the
 * caller intentionally does NOT await) and returns every process-level
 * `unhandledRejection` it leaked.
 *
 * Ambient `unhandledRejection` listeners (e.g. vitest's, which would fail the
 * whole run) are detached for the duration so a leak surfaces as a returned
 * array entry, then restored. Used to assert the "fire-and-forget safety"
 * invariant: navigation methods called without `await` must internally
 * suppress expected rejections (#721).
 */
export async function captureUnhandledRejections(
  action: () => void,
): Promise<unknown[]> {
  const captured: unknown[] = [];
  const previous = process.listeners("unhandledRejection");

  process.removeAllListeners("unhandledRejection");

  const handler = (reason: unknown): void => {
    captured.push(reason);
  };

  process.on("unhandledRejection", handler);

  try {
    action();
    // `unhandledRejection` fires only after the microtask queue settles; one
    // macrotask tick reliably flushes it before we read `captured`.
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    process.off("unhandledRejection", handler);

    for (const listener of previous) {
      process.on("unhandledRejection", listener);
    }
  }

  return captured;
}

/**
 * Captures a SYNCHRONOUS throw from a navigation method and returns the thrown
 * value (or `undefined` if it did not throw synchronously). Used to assert the
 * banned-reentrant-navigation guard (RFC §4), which throws REENTRANT_NAVIGATION
 * synchronously — before the Promise is created — when a navigation method is
 * called from inside a transition listener.
 *
 * The lint suppression is justified and centralized here: `fn` is a
 * Promise-returning navigation method, but in the tested path it throws
 * synchronously (the guard runs before the pipeline), so there is no Promise to
 * await or float.
 */
export function captureSyncThrow(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }

  return undefined;
}

export { DEFAULT_TRANSITION } from "../../src/constants";
