// What a guard is HANDED, measured against what its type promises (#1976).
//
// `materialize` declares `State<P, S>`, and `State.transition` is REQUIRED. The
// pending target the transition pipeline builds used to omit the field and pass
// the literal through an `as State<P, S>` cast, so a guard author writing
// `toState.transition.reload` compiled and threw at runtime. The public doc
// example wrote `state.transition?.redirected` — optional-chaining a field the
// type calls required — and `RoutesNamespace.shouldUpdateNode` read it flat.
//
// ⚑ The rule this file states, in two halves that are NOT the same claim:
//   PRODUCER — a state core BUILDS from an intent carries `transition` from
//     construction, so the pending target and the committed state have the same
//     key set and differ only in the frozen shell. Pre-commit it holds
//     `DEFAULT_TRANSITION`; `completeTransition` overwrites it at the commit.
//   CONSUMER — a state core ACCEPTS may not. The commit door preserves a
//     foreign State's absence (#1792), so `getState()` can return one without
//     the field, and a reader must tolerate that. Second describe block.
//
// The sibling files pin the neighbouring halves: `pending-target-authority`
// locks WHAT each pre-commit surface is handed, `state-freeze-authority` locks
// WHO may build and freeze a state.

import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { State } from "@real-router/core/types";

/** Everything a guard can learn about the field, captured synchronously. */
const probe = (state: State) => ({
  present: Object.prototype.hasOwnProperty.call(state, "transition"),
  frozen: Object.isFrozen(state.transition),
  phase: state.transition.phase,
  reason: state.transition.reason,
  // The reads that used to throw. `undefined` is the honest answer for a
  // navigation that has not happened yet; a THROW is not.
  reload: state.transition.reload,
  from: state.transition.from,
  keys: Object.keys(state).join(","),
});

describe("a guard receives a state that satisfies its own type (#1976)", () => {
  const mk = (
    onGuard: (toState: State) => void,
  ): ReturnType<typeof createRouter> =>
    createRouter([
      { name: "h", path: "/h" },
      {
        name: "a",
        path: "/a",
        canActivate: () => (toState: State) => {
          // Synchronously — `completeTransition` mutates this same object by
          // reference one step later, so a snapshot taken afterwards measures
          // the committed state and reports a false green.
          onGuard(toState);

          return true;
        },
      },
    ]);

  it("through a real navigate", async () => {
    let seen: ReturnType<typeof probe> | undefined;
    const router = mk((s) => {
      seen = probe(s);
    });

    await router.start("/h");
    await router.navigate("a");

    expect(seen).toStrictEqual({
      present: true,
      frozen: true,
      phase: "activating",
      reason: "success",
      reload: undefined,
      from: undefined,
      keys: "name,params,search,path,context,transition",
    });
  });

  it("through the canNavigateTo capability predicate", async () => {
    let seen: ReturnType<typeof probe> | undefined;
    const router = mk((s) => {
      seen = probe(s);
    });

    await router.start("/h");
    router.canNavigateTo("a");

    expect(seen).toStrictEqual({
      present: true,
      frozen: true,
      phase: "activating",
      reason: "success",
      reload: undefined,
      from: undefined,
      keys: "name,params,search,path,context,transition",
    });
  });

  it("the committed state carries the REAL meta — so the cells above discriminate", async () => {
    let seen: ReturnType<typeof probe> | undefined;
    const router = mk((s) => {
      seen = probe(s);
    });

    await router.start("/h");
    await router.navigate("a");

    const committed = probe(router.getState()!);

    // Same keys, same frozen `transition` — and a DIFFERENT value in it. Without
    // this the two cells above would pass against a pipeline that attached the
    // real meta early, or against one that never overwrote the default.
    expect(committed.keys).toBe(seen?.keys);
    expect(committed.from).toBe("h");
    expect(seen?.from).toBeUndefined();
  });
});

describe("who may LACK `transition`, and who must tolerate it (#1976)", () => {
  // The producer half above says every State core builds carries the field.
  // This is the consumer half, and it is not the same claim: `getInternals` is
  // published, and the commit door deliberately preserves the ABSENCE of
  // `transition` on a State an application hands it rather than fabricating one
  // (#1792). So a committed state CAN lack it, and core's own public predicate
  // is the thing an adapter calls with that state.
  const foreign = {
    name: "u",
    params: {},
    search: {},
    path: "/u",
    context: {},
  } as unknown as State;

  it("a foreign State commits WITHOUT transition — the door does not fabricate one", async () => {
    const router = createRouter([{ name: "u", path: "/u" }]);

    await router.start("/u");
    getInternals(router).systemCommit(foreign, router.getState(), {});

    const live = router.getState()!;

    // The control for the cell below: if the door ever started filling the
    // field, that test would pass for a reason that has nothing to do with the
    // predicate it is about.
    expect(Object.keys(live).join(",")).toBe("name,params,search,path,context");
    expect(live.transition).toBeUndefined();
  });

  it("shouldUpdateNode survives it, and absent means NOT-reload", async () => {
    const router = createRouter([
      { name: "u", path: "/u" },
      { name: "other", path: "/other" },
    ]);

    await router.start("/u");
    getInternals(router).systemCommit(foreign, router.getState(), {});

    const live = router.getState()!;

    // Threw `Cannot read properties of undefined (reading 'reload')` before
    // #1976 — on a state core itself committed, through a published door.
    expect(() => router.shouldUpdateNode("u")(live)).not.toThrow();

    // ⚠ Asked of an UNRELATED node, which is the only shape that discriminates.
    // `shouldUpdateNode("u")` answers `true` through the route-identity branch
    // whatever `reload` says, so an equality between two such calls is a
    // tautology — it was written that way first, and the commit message claimed
    // on that basis that the fix "could not have been `?? true`". It could have.
    // Here `?? true` reads as reload-forced and returns `true`; absent must mean
    // NOT reloading, so the answer is `false` and the mutant reds.
    expect(router.shouldUpdateNode("other")(live)).toBe(false);

    // Control: the state carrying the neutral default answers the same, so the
    // cell above is about the absence and not about this particular node.
    const withDefault = getPluginApi(router).matchPath("/u")!;

    expect(withDefault.transition.reload).toBeUndefined();
    expect(router.shouldUpdateNode("other")(withDefault)).toBe(false);
  });
});

describe("the writable shell carries CORE's transition, never the caller's (#1976)", () => {
  // `NavigationNamespace.#copyChannels` is the branch's second producer, and the
  // decision it makes is not the same one `materialize` makes. Its input is a
  // State a PLUGIN built, so the choice was between attaching core's own frozen
  // singleton and carrying the caller's `transition` object through. It attaches
  // the singleton — carrying the caller's object is the #1792 aliasing hazard
  // this very door copies both channels to avoid, and it would put an
  // application-owned object on the state guards are handed.
  //
  // ⚑ Without this cell the decision was UNPINNED: rewriting the literal to
  // `transition: state.transition` left the suite green.
  it("a plugin's own transition does not ride into the guard", async () => {
    const callersTransition = {
      phase: "activating",
      reason: "success",
      from: "SPY",
      segments: {
        deactivated: ["SPY"],
        activated: ["SPY"],
        intersection: "SPY",
      },
    } as unknown as State["transition"];

    let seen: State["transition"] | undefined;

    const router = createRouter([
      { name: "h", path: "/h" },
      {
        name: "t",
        path: "/t",
        canActivate: () => (toState: State) => {
          seen = toState.transition;

          return true;
        },
      },
    ]);

    await router.start("/h");

    const handBuilt = {
      name: "t",
      params: {},
      search: {},
      path: "/t",
      context: {},
      transition: callersTransition,
    } as unknown as State;

    await getPluginApi(router).navigateToState(handBuilt);

    // Identity first — the cheapest thing to get wrong is a spread that happens
    // to agree field-by-field while still handing over the caller's object.
    expect(seen).not.toBe(callersTransition);
    // And by value, because core's singleton and the caller's object differ in
    // exactly the fields a spy would carry through.
    expect(seen?.from).toBeUndefined();
    expect(seen?.segments.deactivated).toStrictEqual([]);
    expect(Object.isFrozen(seen)).toBe(true);
  });
});
