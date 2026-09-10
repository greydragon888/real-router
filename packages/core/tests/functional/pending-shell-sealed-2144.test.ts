import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";

import type { State } from "@real-router/core/types";

/**
 * The pending target is sealed before it reaches application code (#2144).
 *
 * ⚑ INVARIANTS 5 has stated "the pending target is READ-ONLY by contract at
 * every one of the twelve" since the pipeline grew a deferred shell; this file
 * is the point at which the contract stops being a promise. Before it, a guard
 * could assign to the shell it was handed and the assignment was what got
 * committed — `params` and `search` were already frozen, but the SLOTS holding
 * them were not, so `toState.params.k = v` threw while `toState.params = {…}`
 * did not.
 *
 * ⚠ The harm is not "a guard can redirect", which reads like a feature. It is
 * that the committed pair can be one core cannot build: rewriting `name` alone
 * commits a state whose `name` and `path` disagree, and no door produces that.
 *
 * ⚠ The shell stays writable at ONE producer, deliberately:
 * `RoutesNamespace.#matchesActiveStateUnsafe` builds a state that lives for the
 * length of one `areStatesEqual` call and reaches nobody, so freezing it buys a
 * guarantee no one can observe. The split is EXPOSURE, not identity — which is
 * why this file asserts through the doors application code actually holds.
 */
describe("#2144 — the pending target is sealed at the handout", () => {
  const routes = [
    { name: "h", path: "/h" },
    { name: "other", path: "/other" },
  ];

  const withGuard = (
    onGuard: (toState: State) => void,
  ): ReturnType<typeof createRouter> =>
    createRouter([
      ...routes,
      {
        name: "target",
        path: "/target/:id?tab",
        canActivate: () => (toState: State) => {
          onGuard(toState);

          return true;
        },
      },
    ] as never);

  it("refuses a write to the shell a route guard is handed", async () => {
    let thrown: unknown;
    const router = withGuard((toState) => {
      try {
        (toState as unknown as { name: string }).name = "other";
      } catch (error) {
        thrown = error;
      }
    });

    try {
      await router.start("/h");
      await router.navigate("target", { id: "7" } as never);

      expect(thrown).toBeInstanceOf(TypeError);
    } finally {
      router.dispose();
    }
  });

  it("commits the pair core built, so name and path cannot disagree", async () => {
    const router = withGuard((toState) => {
      try {
        (toState as unknown as { name: string }).name = "other";
      } catch {
        /* the assertion below is about what got committed, not about the throw */
      }
    });

    try {
      await router.start("/h");
      await router.navigate("target", { id: "7" } as never);

      const committed = router.getState();

      expect(committed?.name).toBe("target");
      expect(committed?.path).toBe("/target/7");
    } finally {
      router.dispose();
    }
  });

  /**
   * ⚠ The two writes need SEPARATE routers. Done in one guard the slot swap
   * runs first and replaces the frozen bag with a fresh literal, so the write
   * that follows lands in an unfrozen object and reports `accepted` — the arm
   * meant as a control then measures the arm it is controlling for.
   */
  const attempt = async (
    write: (toState: State) => void,
  ): Promise<{ outcome: string; committed: unknown }> => {
    let outcome = "accepted";
    const router = withGuard((toState) => {
      try {
        write(toState);
      } catch (error) {
        outcome = (error as Error).constructor.name;
      }
    });

    try {
      await router.start("/h");
      await router.navigate("target", { id: "7" } as never);

      return { outcome, committed: router.getState()?.params };
    } finally {
      router.dispose();
    }
  };

  it("refuses a swap of the whole params SLOT", async () => {
    const { outcome, committed } = await attempt((toState) => {
      (toState as unknown as { params: unknown }).params = { id: "SWAPPED" };
    });

    expect(outcome).toBe("TypeError");
    expect(committed).toStrictEqual({ id: "7" });
  });

  it("control · a write INTO the bag threw before this change too", async () => {
    const { outcome, committed } = await attempt((toState) => {
      (toState.params as Record<string, unknown>).id = "MUTATED";
    });

    expect(outcome).toBe("TypeError");
    expect(committed).toStrictEqual({ id: "7" });
  });

  it("hands canNavigateTo a guard state of the same shape — fidelity", async () => {
    const seen: { frozen?: boolean } = {};
    const router = withGuard((toState) => {
      seen.frozen = Object.isFrozen(toState);
    });

    try {
      await router.start("/h");

      expect(router.canNavigateTo("target", { id: "7" })).toBe(true);
      expect(seen.frozen, "the predicate path seals it too").toBe(true);
    } finally {
      router.dispose();
    }
  });

  it("control · the guard can still READ every field it could before", async () => {
    const read: Record<string, unknown> = {};
    const router = withGuard((toState) => {
      read.name = toState.name;
      read.id = toState.params.id;
      read.tab = toState.search.tab;
      read.path = toState.path;
      read.hasTransition = toState.transition !== undefined;
    });

    try {
      await router.start("/h");
      await router.navigate(
        "target",
        { id: "7" } as never,
        {
          tab: "x",
        } as never,
      );

      expect(read).toStrictEqual({
        name: "target",
        id: "7",
        tab: "x",
        path: "/target/7?tab=x",
        hasTransition: true,
      });
    } finally {
      router.dispose();
    }
  });
});
