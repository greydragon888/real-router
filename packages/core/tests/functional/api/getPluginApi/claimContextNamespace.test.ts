import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { errorCodes, RouterError } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";

import { createTestRouter } from "../../../helpers";

import type { Router } from "@real-router/core";
import type { PluginApi } from "@real-router/core/api";
import type { State } from "@real-router/types";

let router: Router;
let api: PluginApi;

describe("getPluginApi().claimContextNamespace()", () => {
  beforeEach(() => {
    router = createTestRouter();
    api = getPluginApi(router);
  });

  afterEach(() => {
    if (router.isActive()) {
      router.stop();
    }
  });

  describe("happy path", () => {
    it("returns a writer object with write and release methods", () => {
      const claim = api.claimContextNamespace("navigation");

      expect(typeof claim.write).toBe("function");
      expect(typeof claim.release).toBe("function");
    });

    it("writes value to state.context under the claimed namespace", async () => {
      const claim = api.claimContextNamespace("navigation");

      await router.start("/home");

      const state = router.getState()!;

      claim.write(state, { direction: "forward" });

      expect(state.context.navigation).toStrictEqual({ direction: "forward" });
    });

    it("supports multi-hook re-writes — last write wins", async () => {
      const claim = api.claimContextNamespace("navigation");

      await router.start("/home");

      const state = router.getState()!;

      claim.write(state, { direction: "forward" });
      claim.write(state, { direction: "back" });

      expect(state.context.navigation).toStrictEqual({ direction: "back" });
    });

    it("different namespaces can coexist on the same state", async () => {
      const claimA = api.claimContextNamespace("alpha");
      const claimB = api.claimContextNamespace("beta");

      await router.start("/home");

      const state = router.getState()!;

      claimA.write(state, { a: 1 });
      claimB.write(state, { b: 2 });

      expect(state.context.alpha).toStrictEqual({ a: 1 });
      expect(state.context.beta).toStrictEqual({ b: 2 });
    });
  });

  describe("conflict detection", () => {
    it("throws CONTEXT_NAMESPACE_ALREADY_CLAIMED on double claim (same api)", () => {
      api.claimContextNamespace("navigation");

      let caught: RouterError | undefined;

      try {
        api.claimContextNamespace("navigation");
      } catch (error) {
        caught = error as RouterError;
      }

      expect(caught).toBeInstanceOf(RouterError);
      expect(caught!.code).toBe(errorCodes.CONTEXT_NAMESPACE_ALREADY_CLAIMED);
    });

    it("throws CONTEXT_NAMESPACE_ALREADY_CLAIMED on cross-plugin conflict", () => {
      const api2 = getPluginApi(router);

      api.claimContextNamespace("navigation");

      let caught: RouterError | undefined;

      try {
        api2.claimContextNamespace("navigation");
      } catch (error) {
        caught = error as RouterError;
      }

      expect(caught).toBeInstanceOf(RouterError);
      expect(caught!.code).toBe(errorCodes.CONTEXT_NAMESPACE_ALREADY_CLAIMED);
    });
  });

  describe("release", () => {
    it("release() frees the namespace so it can be re-claimed", () => {
      const claim = api.claimContextNamespace("navigation");

      claim.release();

      expect(() => {
        api.claimContextNamespace("navigation");
      }).not.toThrow();
    });

    it("release() allows re-claim by a different api instance", () => {
      const api2 = getPluginApi(router);
      const claim = api.claimContextNamespace("navigation");

      claim.release();

      expect(() => {
        api2.claimContextNamespace("navigation");
      }).not.toThrow();
    });

    it("release() is idempotent — second call is a no-op", () => {
      const claim = api.claimContextNamespace("navigation");

      claim.release();

      expect(() => {
        claim.release();
      }).not.toThrow();
    });

    it("stale release() after dispose is a no-op", () => {
      const claim = api.claimContextNamespace("navigation");

      router.dispose();

      expect(() => {
        claim.release();
      }).not.toThrow();
    });
  });

  describe("dispose safety net", () => {
    it("dispose() clears orphaned claims so subsequent re-claims would be free", () => {
      api.claimContextNamespace("navigation");
      api.claimContextNamespace("data");

      router.dispose();

      const fresh = createTestRouter();
      const freshApi = getPluginApi(fresh);

      expect(() => {
        freshApi.claimContextNamespace("navigation");
        freshApi.claimContextNamespace("data");
      }).not.toThrow();

      fresh.dispose();
    });

    it("throws ROUTER_DISPOSED when claiming after dispose", () => {
      router.dispose();

      let caught: RouterError | undefined;

      try {
        api.claimContextNamespace("navigation");
      } catch (error) {
        caught = error as RouterError;
      }

      expect(caught).toBeInstanceOf(RouterError);
      expect(caught!.code).toBe(errorCodes.ROUTER_DISPOSED);
    });
  });

  describe("cloneRouter isolation", () => {
    it("source and clone have independent claim registries", () => {
      api.claimContextNamespace("navigation");

      const clone = cloneRouter(router);
      const cloneApi = getPluginApi(clone);

      expect(() => {
        cloneApi.claimContextNamespace("navigation");
      }).not.toThrow();

      clone.dispose();
    });

    it("disposing source does not affect clone claims", () => {
      const sourceClaim = api.claimContextNamespace("navigation");
      const clone = cloneRouter(router);
      const cloneApi = getPluginApi(clone);

      sourceClaim.release();
      router.dispose();

      expect(() => {
        cloneApi.claimContextNamespace("navigation");
      }).not.toThrow();

      clone.dispose();
    });
  });

  describe("escape hatch (direct mutation)", () => {
    it("allows direct assignment to state.context without claim API", async () => {
      await router.start("/home");

      const state = router.getState()!;

      state.context.custom = { inline: true };

      expect(state.context.custom).toStrictEqual({ inline: true });
    });
  });
});

describe("State.context", () => {
  let stateRouter: Router;

  beforeEach(() => {
    stateRouter = createTestRouter();
  });

  afterEach(() => {
    if (stateRouter.isActive()) {
      stateRouter.stop();
    }
  });

  describe("required field", () => {
    it("is present as empty object on every state from makeState", () => {
      const api = getPluginApi(stateRouter);
      const state = api.makeState("home", {}, "/home");

      expect(state.context).toStrictEqual({});
    });

    it("is present after navigation (completeTransition path)", async () => {
      await stateRouter.start("/home");

      const state = stateRouter.getState()!;

      expect(state.context).toStrictEqual({});
    });

    it("is present on UNKNOWN_ROUTE state from navigateToNotFound", async () => {
      const notFoundRouter = createTestRouter({ allowNotFound: true });

      await notFoundRouter.start("/definitely/not/a/route");

      const state = notFoundRouter.getState()!;

      expect(state.context).toStrictEqual({});

      notFoundRouter.stop();
    });
  });

  describe("state isolation", () => {
    it("two navigations produce independent context objects", async () => {
      await stateRouter.start("/home");

      const first = stateRouter.getState()!;

      first.context.marker = "first";

      await stateRouter.navigate("sign-in");

      const second = stateRouter.getState()!;

      expect(second.context).toStrictEqual({});
      expect(first.context.marker).toBe("first");
    });

    it("previousState retains its own context after new navigation", async () => {
      await stateRouter.start("/home");

      const homeState = stateRouter.getState()!;

      homeState.context.visited = true;

      await stateRouter.navigate("sign-in");

      const previous = stateRouter.getPreviousState()!;

      expect(previous.context.visited).toBe(true);
    });
  });

  describe("core field immutability (shallow freeze)", () => {
    let state: State;

    beforeEach(async () => {
      await stateRouter.start("/home");
      state = stateRouter.getState()!;
    });

    it("prevents reassignment of name", () => {
      expect(() => {
        (state as unknown as { name: string }).name = "modified";
      }).toThrow();
    });

    it("prevents reassignment of path", () => {
      expect(() => {
        (state as unknown as { path: string }).path = "/modified";
      }).toThrow();
    });

    it("prevents reassignment of params", () => {
      expect(() => {
        (state as unknown as { params: unknown }).params = {};
      }).toThrow();
    });

    it("prevents reassignment of transition", () => {
      expect(() => {
        (state as unknown as { transition: unknown }).transition = undefined;
      }).toThrow();
    });

    it("prevents reassignment of context itself", () => {
      expect(() => {
        (state as unknown as { context: unknown }).context = { other: 1 };
      }).toThrow();
    });

    it("params is frozen (nested objects inside context-less payload)", () => {
      expect(Object.isFrozen(state.params)).toBe(true);
    });

    it("transition is frozen", () => {
      expect(state.transition).toBeDefined();
      expect(Object.isFrozen(state.transition)).toBe(true);
    });

    it("transition.segments is frozen", () => {
      expect(Object.isFrozen(state.transition!.segments)).toBe(true);
    });

    it("transition.segments.activated is frozen", () => {
      expect(Object.isFrozen(state.transition!.segments.activated)).toBe(true);
    });

    it("transition.segments.deactivated is frozen", () => {
      expect(Object.isFrozen(state.transition!.segments.deactivated)).toBe(
        true,
      );
    });
  });

  describe("context mutability (intentional)", () => {
    it("state.context itself is NOT frozen (plugins write after creation)", async () => {
      await stateRouter.start("/home");

      const state = stateRouter.getState()!;

      expect(Object.isFrozen(state.context)).toBe(false);
    });

    it("allows writing new keys to state.context at runtime", async () => {
      await stateRouter.start("/home");

      const state = stateRouter.getState()!;

      state.context.pluginData = "written at runtime";

      expect(state.context.pluginData).toBe("written at runtime");
    });
  });
});
