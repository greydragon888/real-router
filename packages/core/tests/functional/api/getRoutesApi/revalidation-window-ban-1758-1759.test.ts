import { describe, expect, it, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

/**
 * The error `run` throws SYNCHRONOUSLY, or `undefined`.
 *
 * ⚑ The distinction is the point: the window's bans throw on the call rather
 * than rejecting, so a `.catch()` never sees them and an `await` would measure
 * the wrong thing. Wrapping the call in a named helper also keeps the promise
 * out of the `try`, which is what `sonarjs/no-try-promise` is looking at.
 */
function syncThrow(run: () => void): unknown {
  try {
    run();

    return undefined;
  } catch (error) {
    return error;
  }
}

/**
 * `replace()`'s revalidation window is not a place to mutate the tree or start
 * a navigation (#1758 / #1759).
 *
 * ⚑ ONE rule for two issues, because they were one asymmetry. Route-CRUD from a
 * `subscribeChanges` handler was already banned; the SAME code reached from the
 * route's `decodeParams` or from an activation guard was not, and neither was a
 * navigation. Measured before the fix:
 *
 *     route-CRUD from subscribeChanges  banned
 *     route-CRUD from decodeParams      allowed  → #1758
 *     navigate    from decodeParams     allowed  → #1759
 *
 * The window is the same one either way: application code running between the
 * tree swap and the commit, where the router is holding a state it has not yet
 * revalidated.
 *
 * ⚠ Both bans throw SYNCHRONOUSLY, and `decodeParams` is not isolated —
 * measured, a throw from a decoder propagates out of `replace()` itself. So an
 * app that does not swallow it sees the REENTRANT error rather than a normal
 * return. That is the loudest available outcome and it names the remedy; the
 * cells below pin both halves.
 */
describe("#1758 / #1759 — the revalidation window refuses tree mutation and navigation", () => {
  it("#1758 — a nested replace() from the route's decodeParams is refused", async () => {
    const router = createRouter([{ name: "x", path: "/x/:id" }], {
      allowNotFound: true,
    });

    await router.start("/x/1");

    let caught: unknown;

    expect(() => {
      getRoutesApi(router).replace([
        {
          name: "x",
          path: "/x/:id",
          decodeParams: (bag) => {
            try {
              getRoutesApi(router).replace([{ name: "x", path: "/x/:slug" }]);
            } catch (error) {
              caught = error;
            }

            return bag;
          },
        },
      ]);
    }).not.toThrow();

    expect((caught as { code?: string })?.code).toBe("REENTRANT_TREE_MUTATION");
    expect((caught as Error).message).toContain("revalidat");

    // The committed bag still builds — the round-trip INVARIANTS promise.
    const state = router.getState();

    expect(state?.params).toStrictEqual({ id: "1" });
    expect(router.buildPath(String(state?.name), state?.params)).toBe("/x/1");
  });

  it("#1758 — the same nested replace() from an activation guard is refused", async () => {
    const router = createRouter([{ name: "x", path: "/x/:id" }], {
      allowNotFound: true,
    });

    await router.start("/x/1");

    let caught: unknown;
    let renamed = false;

    // ⚠ Once. A guard that renames on every call re-triggers its own identity
    // change and dies on a stack overflow, which the router reports as an
    // ordinary blocked navigation — the right corrupt state for the wrong
    // reason (#1758's own note to whoever writes this test).
    getLifecycleApi(router).addActivateGuard("y", () => () => {
      if (!renamed) {
        renamed = true;

        try {
          getRoutesApi(router).replace([{ name: "y", path: "/x/:slug" }]);
        } catch (error) {
          caught = error;
        }
      }

      return true;
    });

    getRoutesApi(router).replace([{ name: "y", path: "/x/:id" }]);

    expect((caught as { code?: string })?.code).toBe("REENTRANT_TREE_MUTATION");

    const state = router.getState();

    expect(router.buildPath(String(state?.name), state?.params)).toBe("/x/1");
  });

  it("#1759 — a navigation started from the window is refused, and the state stays honest", async () => {
    const router = createRouter(
      [
        { name: "a", path: "/a" },
        { name: "blocked", path: "/blocked" },
      ],
      { allowNotFound: true },
    );

    await router.start("/a");

    getLifecycleApi(router).addActivateGuard(
      "blocked",
      () => () =>
        new Promise((resolve) =>
          setTimeout(() => {
            resolve(false);
          }, 5),
        ),
    );

    let caught: unknown;

    // `a` is GONE; `/a` now belongs to `a2`, whose decoder runs in the window.
    getRoutesApi(router).replace([
      {
        name: "a2",
        path: "/a",
        decodeParams: (bag) => {
          caught = syncThrow(() => {
            void router.navigate("blocked");
          });

          return bag;
        },
      },
      { name: "blocked", path: "/blocked" },
    ]);

    expect((caught as { code?: string })?.code).toBe("REENTRANT_NAVIGATION");

    await new Promise((resolve) => setTimeout(resolve, 20));

    const state = router.getState();

    // The revalidation was never deferred to a navigation that failed, so it
    // did its job: the committed route is one the new tree holds.
    expect(state?.name).toBe("a2");
    expect(getRoutesApi(router).has("a2")).toBe(true);
    expect(router.buildPath("a2")).toBe("/a");
  });

  it("an unswallowed refusal leaves replace() itself throwing — the loud half", async () => {
    const router = createRouter([{ name: "x", path: "/x/:id" }], {
      allowNotFound: true,
    });

    await router.start("/x/1");

    expect(() => {
      getRoutesApi(router).replace([
        {
          name: "x",
          path: "/x/:id",
          decodeParams: (bag) => {
            getRoutesApi(router).replace([{ name: "x", path: "/x/:slug" }]);

            return bag;
          },
        },
      ]);
    }).toThrow(/REENTRANT_TREE_MUTATION|revalidat/u);
  });

  it("CONTROL — the remedy the message names actually works", async () => {
    const router = createRouter([{ name: "x", path: "/x/:id" }], {
      allowNotFound: true,
    });

    await router.start("/x/1");

    let deferred: Promise<void> | undefined;

    getRoutesApi(router).replace([
      {
        name: "x",
        path: "/x/:id",
        decodeParams: (bag) => {
          deferred = new Promise<void>((resolve) => {
            queueMicrotask(() => {
              getRoutesApi(router).replace([{ name: "x", path: "/x/:slug" }]);
              resolve();
            });
          });

          return bag;
        },
      },
    ]);

    await deferred;

    expect(getRoutesApi(router).get("x")?.path).toBe("/x/:slug");
  });

  it("CONTROL — outside the window both doors are open", async () => {
    const router = createRouter(
      [
        { name: "x", path: "/x/:id" },
        { name: "home", path: "/home" },
      ],
      { allowNotFound: true },
    );

    await router.start("/x/1");

    // A plain second replace() revalidates correctly, as it always did.
    getRoutesApi(router).replace([
      { name: "x", path: "/x/:slug" },
      { name: "home", path: "/home" },
    ]);

    expect(router.getState()?.params).toStrictEqual({ slug: "1" });

    await expect(router.navigate("home")).resolves.toMatchObject({
      name: "home",
    });
  });

  it("CONTROL — the subscribeChanges ban keeps its own text", async () => {
    const router = createRouter([{ name: "x", path: "/x/:id" }], {
      allowNotFound: true,
    });

    await router.start("/x/1");

    let caught: unknown;

    getRoutesApi(router).subscribeChanges(() => {
      try {
        getRoutesApi(router).add({ name: "extra", path: "/extra" });
      } catch (error) {
        caught = error;
      }
    });

    getRoutesApi(router).replace([{ name: "x", path: "/x/:id" }]);

    expect((caught as Error).message).toContain("subscribeChanges handler");
  });

  it("CONTROL — a TREE_CHANGED handler is told about its own window, not the other", async () => {
    // Both bans are reachable from the same handler; the two messages must not
    // be interchangeable, which is what #1665 buys with a per-window text.
    const router = createRouter([{ name: "x", path: "/x/:id" }], {
      allowNotFound: true,
    });

    await router.start("/x/1");

    const seen: string[] = [];

    getRoutesApi(router).subscribeChanges(() => {
      const refusal = syncThrow(() => {
        void router.navigate("x", { id: "2" });
      });

      if (refusal) {
        seen.push((refusal as Error).message);
      }
    });

    getRoutesApi(router).replace([{ name: "x", path: "/x/:id" }]);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/router event listener|revalidat/u);
  });

  it("the window closes — a later mutation from anywhere is accepted", async () => {
    const router = createRouter([{ name: "x", path: "/x/:id" }], {
      allowNotFound: true,
    });

    await router.start("/x/1");

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      getRoutesApi(router).replace([{ name: "x", path: "/x/:id" }]);

      // Immediately after, with no deferral at all.
      getRoutesApi(router).add({ name: "later", path: "/later" });

      expect(getRoutesApi(router).has("later")).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });
});
