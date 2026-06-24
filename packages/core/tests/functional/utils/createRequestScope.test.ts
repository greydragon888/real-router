import { describe, it, expect, vi } from "vitest";

import { RouterError, errorCodes } from "@real-router/core";
import { getDependenciesApi, getRoutesApi } from "@real-router/core/api";
import { createRequestScope } from "@real-router/core/utils";

import { createTestRouter } from "../../helpers";

import type { Router } from "@real-router/core";
import type { IncomingMessageLike } from "@real-router/core/utils";

interface FakeIncomingMessage extends IncomingMessageLike {
  emitClose: () => void;
  listenerCount: () => number;
}

function createFakeIncomingMessage(): FakeIncomingMessage {
  const listeners = new Set<() => void>();

  const fake: FakeIncomingMessage = {
    on(event, listener) {
      if (event === "close") {
        listeners.add(listener);
      }

      return fake;
    },
    removeListener(event, listener) {
      if (event === "close") {
        listeners.delete(listener);
      }

      return fake;
    },
    emitClose() {
      for (const listener of listeners) {
        listener();
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };

  return fake;
}

/**
 * Public disposal probe. After `dispose()`, every mutating router method throws
 * `RouterError(ROUTER_DISPOSED)` — so a throwaway `getRoutesApi().add()` reveals
 * disposal without reaching into `getInternals().isDisposed()`.
 *
 * NB: `router.isActive()` cannot be used here — it is ALSO `false` on a
 * never-started clone, so it does not distinguish "disposed" from "idle"
 * (audit 2026-06-23). On a live (non-disposed) clone the probe simply registers
 * one inert route and returns `false`; the clone is torn down immediately after.
 */
function isRouterDisposed(router: Router): boolean {
  try {
    getRoutesApi(router).add({
      name: "__dispose_probe__",
      path: "/__dispose_probe__",
    });

    return false;
  } catch (error) {
    return (
      error instanceof RouterError && error.code === errorCodes.ROUTER_DISPOSED
    );
  }
}

describe("createRequestScope", () => {
  describe("Node IncomingMessage shape", () => {
    it("creates a request-scoped router clone with an AbortSignal tied to the close event", () => {
      const baseRouter = createTestRouter();
      const request = createFakeIncomingMessage();

      const scope = createRequestScope(request, baseRouter);

      expect(scope.router).not.toBe(baseRouter);
      expect(scope.signal.aborted).toBe(false);
      expect(request.listenerCount()).toBe(1);

      request.emitClose();

      expect(scope.signal.aborted).toBe(true);

      baseRouter.stop();
    });

    it("injects abortSignal into the cloned router's dependencies and merges user-supplied deps", () => {
      interface Deps extends Record<string, unknown> {
        currentUser: string;
        abortSignal?: AbortSignal;
      }

      const baseRouter = createTestRouter() as unknown as Parameters<
        typeof createRequestScope<Deps>
      >[1];
      const request = createFakeIncomingMessage();
      const scope = createRequestScope<Deps>(request, baseRouter, {
        currentUser: "alice",
      });

      // Public read of the cloned router's merged dependencies.
      const deps = getDependenciesApi(scope.router).getAll() as Deps;

      expect(deps.currentUser).toBe("alice");
      expect(deps.abortSignal).toBe(scope.signal);

      baseRouter.stop();
    });

    it("dispose detaches the close listener and disposes the cloned router", async () => {
      const baseRouter = createTestRouter();
      const request = createFakeIncomingMessage();

      const scope = createRequestScope(request, baseRouter);

      expect(request.listenerCount()).toBe(1);

      await scope.dispose();

      expect(request.listenerCount()).toBe(0);
      expect(isRouterDisposed(scope.router)).toBe(true);

      baseRouter.stop();
    });

    it("dispose is idempotent — second call is a no-op", async () => {
      const baseRouter = createTestRouter();
      const request = createFakeIncomingMessage();

      const scope = createRequestScope(request, baseRouter);
      const disposeSpy = vi.spyOn(scope.router, "dispose");

      await scope.dispose();
      await scope.dispose();

      // the `disposed` flag must gate the body: router.dispose runs exactly once
      // (kills the flag cond / block / assignment mutants that would re-run it)
      expect(disposeSpy).toHaveBeenCalledTimes(1);
      expect(request.listenerCount()).toBe(0);
      expect(isRouterDisposed(scope.router)).toBe(true);

      baseRouter.stop();
    });

    it("classifies a request with a malformed signal as Node, not Web (isRequestLike .aborted check)", () => {
      const baseRouter = createTestRouter();
      const fake = createFakeIncomingMessage();
      // signal present but has no boolean `aborted` → must NOT be treated as a
      // Web Request; isRequestLike's `typeof signal.aborted === "boolean"` rejects it
      const request = Object.assign(fake, { signal: {} as AbortSignal });

      const scope = createRequestScope(request, baseRouter);

      // Node path: close listener attached + scope.signal is a real controller signal
      expect(request.listenerCount()).toBe(1);
      expect(typeof scope.signal.aborted).toBe("boolean");
      expect(scope.signal).not.toBe(request.signal);

      void scope.dispose();
      baseRouter.stop();
    });

    it("does not fail when removeListener is missing on the IncomingMessage", async () => {
      const baseRouter = createTestRouter();
      const listeners = new Set<() => void>();
      const request: IncomingMessageLike = {
        on(_event, listener) {
          listeners.add(listener);

          return request;
        },
      };

      const scope = createRequestScope(request, baseRouter);

      await expect(scope.dispose()).resolves.toBeUndefined();
      expect(isRouterDisposed(scope.router)).toBe(true);

      baseRouter.stop();
    });
  });

  describe("Web Request shape", () => {
    it("uses request.signal directly without attaching a close listener", () => {
      const baseRouter = createTestRouter();
      const controller = new AbortController();
      const request = { signal: controller.signal };

      const scope = createRequestScope(request, baseRouter);

      expect(scope.signal).toBe(controller.signal);
      expect(scope.signal.aborted).toBe(false);

      controller.abort();

      expect(scope.signal.aborted).toBe(true);

      baseRouter.stop();
    });

    it("dispose only tears down the router for Web Request inputs (signal stays controlled by the caller)", async () => {
      const baseRouter = createTestRouter();
      const controller = new AbortController();
      const request = { signal: controller.signal };

      const scope = createRequestScope(request, baseRouter);

      await scope.dispose();

      expect(isRouterDisposed(scope.router)).toBe(true);
      expect(controller.signal.aborted).toBe(false);

      baseRouter.stop();
    });
  });

  describe("Symbol.asyncDispose / `await using`", () => {
    it("disposes the router when the scope leaves an `await using` block", async () => {
      const baseRouter = createTestRouter();
      const request = createFakeIncomingMessage();

      let scopedRouter: Router | undefined;

      {
        await using scope = createRequestScope(request, baseRouter);

        scopedRouter = scope.router;

        expect(isRouterDisposed(scope.router)).toBe(false);
      }

      expect(isRouterDisposed(scopedRouter)).toBe(true);
      expect(request.listenerCount()).toBe(0);

      baseRouter.stop();
    });

    it("Symbol.asyncDispose is the same function as dispose()", () => {
      const baseRouter = createTestRouter();
      const request = createFakeIncomingMessage();
      const scope = createRequestScope(request, baseRouter);

      expect(scope[Symbol.asyncDispose]).toBe(scope.dispose);

      baseRouter.stop();
    });
  });

  describe("router operability", () => {
    it("the cloned router can navigate independently of the base router", async () => {
      const baseRouter = createTestRouter();
      const request = createFakeIncomingMessage();
      const scope = createRequestScope(request, baseRouter);

      const state = await scope.router.start("/home");

      expect(state.name).toBe("home");
      expect(baseRouter.isActive()).toBe(false);

      await scope.dispose();
      baseRouter.stop();
    });
  });
});
