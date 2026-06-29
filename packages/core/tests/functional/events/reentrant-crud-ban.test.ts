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
import { getRoutesApi } from "@real-router/core/api";

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
