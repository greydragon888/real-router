import { describe, it, expect } from "vitest";

import { getInternals } from "../../../src/internals";
import { createRequestScope } from "../../../src/utils/createRequestScope";
import { createTestRouter } from "../../helpers";

import type {
  IncomingMessageLike,
  RequestScope,
} from "../../../src/utils/createRequestScope";
import type { PluginFactory } from "@real-router/core";

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

function isDisposed(scope: RequestScope): boolean {
  return getInternals(scope.router).isDisposed();
}

function captureDeps<D extends Record<string, unknown>>(
  scope: RequestScope<D>,
): D {
  let captured: D | undefined;
  const plugin: PluginFactory<D> = (_router, getDependency) => {
    captured = new Proxy({} as D, {
      get: (_target, key) => getDependency(key as keyof D),
    });

    return {};
  };

  scope.router.usePlugin(plugin);

  return captured!;
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

      const deps = captureDeps(scope);

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
      expect(isDisposed(scope)).toBe(true);

      baseRouter.stop();
    });

    it("dispose is idempotent — second call is a no-op", async () => {
      const baseRouter = createTestRouter();
      const request = createFakeIncomingMessage();

      const scope = createRequestScope(request, baseRouter);

      await scope.dispose();
      await scope.dispose();

      expect(isDisposed(scope)).toBe(true);

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
      expect(isDisposed(scope)).toBe(true);

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

      expect(isDisposed(scope)).toBe(true);
      expect(controller.signal.aborted).toBe(false);

      baseRouter.stop();
    });
  });

  describe("Symbol.asyncDispose / `await using`", () => {
    it("disposes the router when the scope leaves an `await using` block", async () => {
      const baseRouter = createTestRouter();
      const request = createFakeIncomingMessage();

      let routerInternals: ReturnType<typeof getInternals> | undefined;

      {
        await using scope = createRequestScope(request, baseRouter);

        routerInternals = getInternals(scope.router);

        expect(routerInternals.isDisposed()).toBe(false);
      }

      expect(routerInternals?.isDisposed()).toBe(true);
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
