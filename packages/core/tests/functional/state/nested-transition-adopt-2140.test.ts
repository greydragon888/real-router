import { beforeEach, describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router, State } from "@real-router/core/types";

/**
 * `systemCommit` is the one door that COMMITS a State built outside core —
 * `getInternals` is published, and `navigateToState` takes a foreign State too,
 * but runs it through the pipeline, which constructs and freezes its own. So
 * this door adopts the shell field by field, and nothing the caller still holds
 * is committed as core's own (#1792). This file owns the DEPTH of that adoption.
 *
 * ⚠ The door matters, and the issue's own class-guard named the wrong one.
 * Measured on `master` `56dcecc52`, one hand-built state through each:
 *
 * | door               | segments is caller's | segments frozen |
 * | ------------------ | -------------------- | --------------- |
 * | `systemCommit`     | yes                  | no              |
 * | `navigateToState`  | no                   | yes             |
 *
 * `navigateToState` attaches core's own `DEFAULT_TRANSITION` and never reads
 * the caller's meta, so it is the CONTROL here rather than a second subject: a
 * cell written against it passes on the live defect.
 *
 * ⚠ `Object.isFrozen(undefined)` is `true`, so every frozenness assertion below
 * is preceded by a presence assertion. Without that pairing a dropped field
 * reports as sealed.
 */
describe("systemCommit adopts the foreign transition at every level (#2140)", () => {
  let router: Router;

  function segments() {
    return {
      deactivated: ["old"],
      activated: ["new"],
      intersection: "",
    };
  }

  function foreignState(transition: unknown): State {
    return {
      name: "b",
      params: {},
      search: {},
      path: "/b",
      context: {},
      transition,
    } as unknown as State;
  }

  beforeEach(async () => {
    router = createRouter([
      { name: "a", path: "/a" },
      { name: "b", path: "/b" },
    ]);

    await router.start("/a");
  });

  it("the segments container is core's own, and it is frozen", () => {
    const held = segments();

    getInternals(router).systemCommit(
      foreignState({
        phase: "activating",
        reason: "success",
        segments: held,
      }),
      undefined,
      {},
    );

    const committed = router.getState()!.transition.segments;

    expect(committed, "present").toBeDefined();
    expect(committed, "not the object the caller passed").not.toBe(held);
    expect(Object.isFrozen(committed), "frozen").toBe(true);
  });

  it("and so are the two arrays it holds — the level below the container", () => {
    // The container being core's own says nothing about what it holds:
    // `Object.freeze` is shallow, so an adopted `segments` still handed back
    // the caller's arrays, live. `getState().transition.segments.activated`
    // is published state, and `.push()` on it rewrote it after the commit.
    const held = segments();

    getInternals(router).systemCommit(
      foreignState({
        phase: "activating",
        reason: "success",
        segments: held,
      }),
      undefined,
      {},
    );

    const committed = router.getState()!.transition.segments;

    expect(committed.deactivated, "present").toBeDefined();
    expect(committed.deactivated, "not the caller's array").not.toBe(
      held.deactivated,
    );
    expect(Object.isFrozen(committed.deactivated), "frozen").toBe(true);

    expect(committed.activated, "present").toBeDefined();
    expect(committed.activated, "not the caller's array").not.toBe(
      held.activated,
    );
    expect(Object.isFrozen(committed.activated), "frozen").toBe(true);

    expect(committed.deactivated, "the values survive the copy").toStrictEqual([
      "old",
    ]);
    expect(committed.activated, "the values survive the copy").toStrictEqual([
      "new",
    ]);
    expect(committed.intersection, "and so does the scalar slot").toBe("");
  });

  it("an own __proto__ on the segments container does not ride in", () => {
    // The parent level drops it (#1191 / #1788); one level down it did not, so
    // `JSON.stringify(getState())` carried the key and `Object.assign({},
    // getState().transition.segments)` was a pollution primitive.
    const held = JSON.parse(
      '{"deactivated":[],"activated":[],"intersection":"","__proto__":{"polluted":1}}',
    ) as Record<string, unknown>;

    getInternals(router).systemCommit(
      foreignState({
        phase: "activating",
        reason: "success",
        segments: held,
      }),
      undefined,
      {},
    );

    const committed = router.getState()!.transition.segments;

    expect(committed, "present").toBeDefined();
    expect(
      Object.hasOwn(committed, "__proto__"),
      "no own __proto__ on the committed container",
    ).toBe(false);
    expect(
      Object.getPrototypeOf({ ...committed }),
      "and merging it is not a pollution primitive",
    ).toBe(Object.prototype);
  });

  it("an undefined-valued key on the segments container is absence, as it is one level up", () => {
    getInternals(router).systemCommit(
      foreignState({
        phase: "activating",
        reason: "success",
        segments: {
          deactivated: ["old"],
          activated: undefined,
          intersection: "",
        },
      }),
      undefined,
      {},
    );

    const committed = router.getState()!.transition.segments;

    expect(committed, "present").toBeDefined();
    expect(
      Object.hasOwn(committed, "activated"),
      "no key, rather than a key holding undefined",
    ).toBe(false);
  });

  it("an undefined-valued key on the META is absence too, not just on the container", () => {
    // The outer walk's own `undefined` drop. Its sibling one level down has a
    // cell above; this one had none, and the mutation that removed it left the
    // whole package green — so `transition.reload = undefined` would have been
    // committed as a key holding `undefined`, which `TransitionMeta` declares
    // as an optional flag rather than an always-present one.
    getInternals(router).systemCommit(
      foreignState({
        phase: "activating",
        reason: "success",
        reload: undefined,
      }),
      undefined,
      {},
    );

    const committed = router.getState()!.transition as unknown as Record<
      string,
      unknown
    >;

    expect(committed, "present").toBeDefined();
    expect(
      Object.hasOwn(committed, "reload"),
      "no key, rather than a key holding undefined",
    ).toBe(false);
    expect(
      Object.hasOwn(committed, "phase"),
      "CONTROL — a defined key does land",
    ).toBe(true);
  });

  it("the copy is core's, even when the caller's array offers its own slice", () => {
    // Asking the object for its copy hands the decision back to whoever built
    // it: an own `slice` (or an own `Symbol.iterator`, for a spread) shadows the
    // intrinsic, and the "copy" is then whatever that function returned —
    // committed as core's own, frozen, and wrong.
    const activated = ["real"] as string[] & { slice?: unknown };

    activated.slice = () => ["HIJACKED"];

    getInternals(router).systemCommit(
      foreignState({
        phase: "activating",
        reason: "success",
        segments: { deactivated: [], activated, intersection: "" },
      }),
      undefined,
      {},
    );

    const committed = router.getState()!.transition.segments;

    expect(committed.activated, "present").toBeDefined();
    expect(
      committed.activated,
      "the real elements, not the hijack's",
    ).toStrictEqual(["real"]);
    expect(committed.activated, "and still not the caller's array").not.toBe(
      activated,
    );
  });

  it("the copy decides with a captured Array.isArray, not the one the page has at commit time", () => {
    // The doctrine `guards.ts` states, applied to the one intrinsic that
    // decides whether a slot of the committed meta is copied or carried. It is
    // not an `Object` member, so `captured-intrinsics-authority-1971`'s scan
    // does not reach it and this cell is the only thing that does.
    const original = Array.isArray;
    const held = segments();

    try {
      Array.isArray = (() => false) as unknown as typeof Array.isArray;

      getInternals(router).systemCommit(
        foreignState({
          phase: "activating",
          reason: "success",
          segments: held,
        }),
        undefined,
        {},
      );
    } finally {
      Array.isArray = original;
    }

    const committed = router.getState()!.transition.segments;

    expect(committed.activated, "present").toBeDefined();
    expect(committed.activated, "still core's own array").not.toBe(
      held.activated,
    );
    expect(Object.isFrozen(committed.activated), "still frozen").toBe(true);
  });

  it("a nullish segments slot stays absent rather than borrowing the empty singleton", () => {
    // `adoptForeignBag`'s empty answer is a SHARED singleton, so writing the
    // slot unconditionally would make `getState().transition.segments` the same
    // object as some other state's `params` — the defect the parent level's own
    // comment says it exists to prevent, reproduced one level down.
    getInternals(router).systemCommit(
      foreignState({
        phase: "activating",
        reason: "success",
        segments: null,
      }),
      undefined,
      {},
    );

    const committed = router.getState()!.transition as unknown as Record<
      string,
      unknown
    >;

    expect(
      Object.hasOwn(committed, "segments"),
      "no key, rather than a key holding a borrowed empty object",
    ).toBe(false);
    expect(committed.segments, "and certainly not a shared empty").toBe(
      undefined,
    );
  });

  it("a null transition is absence too — both nullish spellings, not just undefined", () => {
    // The conditional that guards this slot tested `!== undefined`, so the
    // `null` spelling walked into the very trap its own comment describes:
    // `adoptForeignBag(null, EMPTY_PARAMS)` answers with the shared singleton,
    // and the committed `transition` WAS some other state's `params`.
    const singleton = getPluginApi(
      createRouter([{ name: "z", path: "/z" }]),
    ).makeState("z", {}, {}).params;

    getInternals(router).systemCommit(foreignState(null), undefined, {});

    const committed = router.getState()! as unknown as Record<string, unknown>;

    expect(
      Object.hasOwn(committed, "transition"),
      "no key, rather than a key holding a borrowed empty object",
    ).toBe(false);
    expect(
      committed.transition,
      "and certainly not the shared empty singleton",
    ).not.toBe(singleton);

    // ⚠ The control, and this cell is vacuous without it: both assertions
    // above also hold when the door commits NO transition at all, which is a
    // broken door rather than the contract. Measured — the mutant that drops
    // the slot unconditionally reds every other cell in this file and leaves
    // this one green.
    getInternals(router).systemCommit(
      foreignState({ phase: "activating", reason: "success" }),
      undefined,
      {},
    );

    expect(
      Object.hasOwn(router.getState()!, "transition"),
      "CONTROL — a non-nullish transition still lands",
    ).toBe(true);
  });

  it("CONTROL — an absent transition is still absent, and an absent segments still absent", () => {
    // The adoption must not INVENT the levels it copies. Both halves of this
    // cell were already true before #2140 and must survive it.
    getInternals(router).systemCommit(foreignState(undefined), undefined, {});

    expect(
      Object.hasOwn(router.getState()!, "transition"),
      "no transition key",
    ).toBe(false);

    getInternals(router).systemCommit(
      foreignState({ phase: "activating", reason: "success" }),
      undefined,
      {},
    );

    const committed = router.getState()!.transition as unknown as Record<
      string,
      unknown
    >;

    expect(committed, "the transition itself is there").toBeDefined();
    expect(Object.hasOwn(committed, "segments"), "no segments key").toBe(false);
  });

  it("CONTROL — navigateToState was already clean, and the pipeline's own arc too", async () => {
    // Both are the reason the fix belongs at ONE door: `navigateToState`
    // attaches core's frozen singleton instead of reading the caller's meta,
    // and the pipeline's `buildTransitionMeta` freezes all three levels itself.
    const held = segments();

    await getInternals(router).navigateToState(
      foreignState({
        phase: "activating",
        reason: "success",
        segments: held,
      }),
      {},
    );

    const viaNavigate = router.getState()!.transition.segments;

    expect(viaNavigate, "present").toBeDefined();
    expect(viaNavigate, "not the caller's container").not.toBe(held);
    expect(Object.isFrozen(viaNavigate), "frozen").toBe(true);

    await router.navigate("a");
    await router.navigate("b");

    const viaPipeline = router.getState()!.transition.segments;

    expect(viaPipeline, "present").toBeDefined();
    expect(Object.isFrozen(viaPipeline), "container frozen").toBe(true);
    expect(viaPipeline.activated, "present").toBeDefined();
    expect(Object.isFrozen(viaPipeline.activated), "array frozen").toBe(true);
  });
});
