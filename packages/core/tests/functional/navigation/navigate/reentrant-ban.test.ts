// RFC navigation-cancellation-unification §4: synchronous reentrant navigation
// from inside a transition-event listener is BANNED — it throws
// RouterError(REENTRANT_NAVIGATION) synchronously (O-A: sync-throw, caught by the
// emit's onListenerError isolation inside a listener; observed here via
// captureSyncThrow). Deferred (async / microtask) navigation from a listener is
// NOT banned (the transition has settled, FSM is READY again).
//
// Replaces the old "allow-but-bound (RecursionDepthError at maxEventDepth)"
// behaviour that #945 / #308 patched around.

import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";

import { captureSyncThrow, createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";

let router: Router;

const isReentrantError = (value: unknown): value is RouterError =>
  value instanceof RouterError &&
  value.code === errorCodes.REENTRANT_NAVIGATION;

describe("§4 ban: synchronous reentrant navigation throws REENTRANT_NAVIGATION", () => {
  beforeEach(async () => {
    router = createTestRouter();
    await router.start("/home");
  });

  afterEach(() => {
    router.dispose();
  });

  it("reentrant navigate() from a subscribe (TRANSITION_SUCCESS) listener throws", async () => {
    let captured: unknown;

    const unsub = router.subscribe(({ route }) => {
      if (route.name === "users") {
        captured = captureSyncThrow(() => router.navigate("orders"));
      }
    });

    await router.navigate("users");
    unsub();

    expect(isReentrantError(captured)).toBe(true);
  });

  it("reentrant navigate() from a subscribeLeave (LEAVE_APPROVE) listener throws", async () => {
    let captured: unknown;

    const unsub = router.subscribeLeave(({ nextRoute }) => {
      if (nextRoute.name === "users") {
        captured = captureSyncThrow(() => router.navigate("orders"));
      }
    });

    await router.navigate("users");
    unsub();

    expect(isReentrantError(captured)).toBe(true);
  });

  it("reentrant navigate() from a plugin onTransitionStart (TRANSITION_START) hook throws", async () => {
    let captured: unknown;
    let fired = false;

    router.dispose();
    router = createTestRouter();
    router.usePlugin(() => ({
      onTransitionStart(toState) {
        if (toState.name === "users" && !fired) {
          fired = true;
          captured = captureSyncThrow(() => router.navigate("orders"));
        }
      },
    }));
    await router.start("/home");

    await router.navigate("users");

    expect(isReentrantError(captured)).toBe(true);
  });

  it("reentrant navigateToDefault() from a subscribe listener throws", async () => {
    let captured: unknown;

    const unsub = router.subscribe(({ route }) => {
      if (route.name === "users") {
        captured = captureSyncThrow(() => router.navigateToDefault());
      }
    });

    await router.navigate("users");
    unsub();

    expect(isReentrantError(captured)).toBe(true);
  });

  it("reentrant navigateToNotFound() from a subscribe listener throws", async () => {
    let captured: unknown;

    const unsub = router.subscribe(({ route }) => {
      if (route.name === "users") {
        captured = captureSyncThrow(() => router.navigateToNotFound("/nope"));
      }
    });

    await router.navigate("users");
    unsub();

    expect(isReentrantError(captured)).toBe(true);
  });

  it("DEFERRED (microtask) navigate from a listener is allowed (not reentrant)", async () => {
    let deferredErr: unknown;
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => {
      resolveDone = r;
    });

    const unsub = router.subscribe(({ route }) => {
      if (route.name === "users") {
        queueMicrotask(() => {
          router.navigate("orders").then(
            () => {
              resolveDone();
            },
            (error: unknown) => {
              deferredErr = error;
              resolveDone();
            },
          );
        });
      }
    });

    await router.navigate("users");
    await done;
    unsub();

    expect(deferredErr).toBeUndefined();
    expect(router.getState()?.name).toBe("orders");
  });
});
