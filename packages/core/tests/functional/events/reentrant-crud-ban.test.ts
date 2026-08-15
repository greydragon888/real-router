// #1032: synchronous reentrant route-CRUD from inside a `subscribeChanges`
// handler is BANNED — a CRUD op called while a `TREE_CHANGED` emit is on the
// stack throws `RouterError(REENTRANT_TREE_MUTATION)` synchronously, BEFORE
// mutating (atomic). Mirrors the reentrant-navigate ban (REENTRANT_NAVIGATION,
// RFC navigation-cancellation-unification §4).
//
// The throw surfaces via the emit's `onListenerError` isolation (visible,
// non-fatal) — so the OUTER op completes and the reentrant throw does NOT
// propagate to it; `captureSyncThrow` observes it inside the handler. This
// removes the old non-atomic / causal-order-inverted behaviour (the cascade
// could leave a partially-mutated tree when it hit `maxEventDepth`).
//
// Boundary (NOT banned): deferred CRUD (`queueMicrotask` / `await`) from a
// handler runs after the dispatch settles; CRUD from a *transition* listener
// (`subscribe`, not a TREE_CHANGED dispatch) is a normal mutation.

import { describe, it, expect } from "vitest";

import { createRouter, errorCodes, RouterError } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { captureSyncThrow } from "../../helpers";

type Api = ReturnType<typeof getRoutesApi>;

const makeRouter = (): Api =>
  getRoutesApi(
    createRouter([
      { name: "home", path: "/home" },
      { name: "seed", path: "/seed" },
    ]),
  );

const REENTRANT_OPS: { name: string; run: (api: Api) => void }[] = [
  {
    name: "add",
    run: (api) => {
      api.add({ name: "x", path: "/x" });
    },
  },
  {
    name: "remove",
    run: (api) => {
      api.remove("seed");
    },
  },
  {
    name: "replace",
    run: (api) => {
      api.replace([{ name: "z", path: "/z" }]);
    },
  },
  {
    name: "clear",
    run: (api) => {
      api.clear();
    },
  },
  {
    name: "update",
    run: (api) => {
      api.update("seed", { defaultParams: { a: "1" } });
    },
  },
];

describe("§ #1032: reentrant route-CRUD from a subscribeChanges handler is banned", () => {
  describe.each(REENTRANT_OPS)("reentrant $name", ({ run }) => {
    it("throws REENTRANT_TREE_MUTATION (surfaced via onListenerError)", () => {
      const api = makeRouter();
      let caught: unknown;
      let armed = true;

      api.subscribeChanges(() => {
        if (!armed) {
          return;
        }

        armed = false;
        caught = captureSyncThrow(() => {
          run(api);
        });
      });

      api.add({ name: "trigger", path: "/trigger" });

      expect(caught).toBeInstanceOf(RouterError);
      expect((caught as RouterError).code).toBe(
        errorCodes.REENTRANT_TREE_MUTATION,
      );
    });
  });

  // #1665 — same class as the navigation ban: the code names a rule, the remedy
  // (defer) does not follow from it, and until now it lived only in the JSDoc
  // above the throw — visible to a core maintainer, not to the caller.
  it("says what was violated and what to do instead", () => {
    const api = makeRouter();
    let caught: unknown;
    let armed = true;

    api.subscribeChanges(() => {
      if (!armed) {
        return;
      }

      armed = false;
      caught = captureSyncThrow(() => {
        api.add({ name: "nested", path: "/nested" });
      });
    });

    api.add({ name: "trigger", path: "/trigger" });

    const message = (caught as RouterError).message;

    expect(message).not.toBe(errorCodes.REENTRANT_TREE_MUTATION);
    expect(message).toMatch(/subscribeChanges/);
    expect(message).toMatch(/queueMicrotask/);
  });

  it("is atomic — a banned reentrant add does NOT mutate the tree", () => {
    const api = makeRouter();
    let armed = true;

    api.subscribeChanges(() => {
      if (!armed) {
        return;
      }

      armed = false;
      captureSyncThrow(() => {
        api.add({ name: "B", path: "/B" });
      });
    });

    api.add({ name: "A", path: "/A" });

    expect(api.has("A")).toBe(true); // outer op committed
    expect(api.has("B")).toBe(false); // reentrant add banned BEFORE mutation
  });

  it("allows DEFERRED (microtask) CRUD from a subscribeChanges handler", async () => {
    const api = makeRouter();
    let armed = true;
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => {
      resolveDone = r;
    });

    api.subscribeChanges(() => {
      if (!armed) {
        return;
      }

      armed = false;
      queueMicrotask(() => {
        api.add({ name: "deferred", path: "/deferred" });
        resolveDone();
      });
    });

    api.add({ name: "trigger", path: "/trigger" });
    await done;

    expect(api.has("deferred")).toBe(true);
  });

  it("allows CRUD from a transition (subscribe) listener — not a TREE_CHANGED dispatch", async () => {
    const router = createRouter([
      { name: "home", path: "/home" },
      { name: "about", path: "/about" },
    ]);
    const api = getRoutesApi(router);

    await router.start("/home");

    let caught: unknown;
    const unsub = router.subscribe(() => {
      caught = captureSyncThrow(() => {
        api.add({ name: "fromNav", path: "/fn" });
      });
    });

    await router.navigate("about");
    unsub();

    expect(caught).toBeUndefined(); // allowed — no TREE_CHANGED on the stack
    expect(api.has("fromNav")).toBe(true);
  });
});

// #1751 — the sixth door. `setRootPath` lives on `PluginApi`, not on
// `getRoutesApi`, which is why the #1032 sweep missed it: it rebuilds tree AND
// matcher (`applyRootPath`) and so is a structural tree mutation by
// construction, but it was formatted after the `getLifecycleApi` template — a
// surface that does not touch the tree at all.
//
// Its own describe rather than a sixth row of REENTRANT_OPS: the table's `run`
// takes the ROUTES api, and — more to the point — the atomicity mirror below
// cannot be `has(name)`. That mirror is the whole test. A guard placed one line
// too late (after `ctx.setRootPath`) passes the throw assertion byte-identically
// and only the EFFECT check tells the two apart.
describe("§ #1751: setRootPath is the sixth door and carries the same ban", () => {
  const makePluginRouter = () =>
    createRouter([{ name: "home", path: "/home" }]);

  it("throws REENTRANT_TREE_MUTATION (surfaced via onListenerError)", () => {
    const router = makePluginRouter();
    const routes = getRoutesApi(router);
    let caught: unknown;
    let armed = true;

    routes.subscribeChanges(() => {
      if (!armed) {
        return;
      }

      armed = false;
      caught = captureSyncThrow(() => {
        getPluginApi(router).setRootPath("/app");
      });
    });

    routes.add({ name: "trigger", path: "/trigger" });

    expect(caught).toBeInstanceOf(RouterError);
    expect((caught as RouterError).code).toBe(
      errorCodes.REENTRANT_TREE_MUTATION,
    );
  });

  it("is atomic — the banned setRootPath does NOT rebuild the tree", () => {
    const router = makePluginRouter();
    const routes = getRoutesApi(router);
    let armed = true;

    routes.subscribeChanges(() => {
      if (!armed) {
        return;
      }

      armed = false;
      captureSyncThrow(() => {
        getPluginApi(router).setRootPath("/app");
      });
    });

    routes.add({ name: "A", path: "/A" });

    expect(routes.has("A")).toBe(true); // outer op committed
    expect(getPluginApi(router).getRootPath()).toBe(""); // root untouched
    expect(router.buildPath("home")).toBe("/home"); // and the matcher with it
  });

  it("allows a DEFERRED setRootPath from a subscribeChanges handler", async () => {
    const router = makePluginRouter();
    const routes = getRoutesApi(router);
    let armed = true;
    let resolveDone!: () => void;
    const done = new Promise<void>((r) => {
      resolveDone = r;
    });

    routes.subscribeChanges(() => {
      if (!armed) {
        return;
      }

      armed = false;
      queueMicrotask(() => {
        getPluginApi(router).setRootPath("/app");
        resolveDone();
      });
    });

    routes.add({ name: "trigger", path: "/trigger" });
    await done;

    expect(router.buildPath("home")).toBe("/app/home");
  });

  // Pins the ORDER, not just the presence. `dispose()` sends DISPOSE before
  // `clearAll()`, and `clearAll()` deliberately leaves `#dispatching` standing
  // (#1164) — so inside a handler that disposed the router BOTH predicates are
  // true. The reentrancy guard sits after `throwIfDisposed` so this arc keeps
  // reporting `ROUTER_DISPOSED`; `persistent-params-plugin`'s teardown documents
  // that code in a `v8 ignore` comment, and it must stay true.
  it("still reports ROUTER_DISPOSED when the handler disposed the router", () => {
    const router = makePluginRouter();
    const routes = getRoutesApi(router);
    let caught: unknown;
    let armed = true;

    routes.subscribeChanges(() => {
      if (!armed) {
        return;
      }

      armed = false;
      router.dispose();
      caught = captureSyncThrow(() => {
        getPluginApi(router).setRootPath("/app");
      });
    });

    routes.add({ name: "trigger", path: "/trigger" });

    expect((caught as RouterError).code).toBe(errorCodes.ROUTER_DISPOSED);
  });
});
