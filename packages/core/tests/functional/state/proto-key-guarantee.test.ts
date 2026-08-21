import { describe, afterEach, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Params, Router, SearchParams, State } from "@real-router/core";

/**
 * The `__proto__` guarantee is held by the COPY SITES (#1792).
 *
 * `__proto__` is the only ACCESSOR among `Object.prototype`'s twelve own
 * members, so `target[key] = value` for that one name reaches the inherited
 * setter: no own key appears, the value is gone with no error and no log, and an
 * OBJECT value replaces the target's prototype instead.
 *
 * ⚑ Every cell drives a public or plugin-API entry point. Where a cell asserts
 * on a return value rather than on `getState()` it says so — `matchPath` commits
 * nothing, and pretending otherwise was a false claim in an earlier revision.
 *
 * ⚠ **Two payload rules, both bought with a defect.** The hostile value must be
 * an OBJECT: plain assignment for this name reaches the inherited setter, which
 * IGNORES a primitive, so a string-valued bag cannot tell a working skip from a
 * missing one — three sites looked pinned under a string and were not. And the
 * key must come FIRST: with it last, replacing a loop's `continue` with `break`
 * changes nothing observable, so the over-run class stays invisible.
 *
 * ⚠ The bag is built with `JSON.parse` or `Object.defineProperty`. A shorthand
 * source literal `{ __proto__: v }` sets the PROTOTYPE and creates no own key,
 * so it cannot express this input — though a COMPUTED-key literal
 * (`{ ["__proto__"]: v }`) can, and does.
 */
describe("the __proto__ guarantee is held by the copy sites (#1792)", () => {
  let router: Router;

  afterEach(() => {
    router.dispose();
  });

  /** Own, enumerable, OBJECT-valued, and FIRST — see the payload rules above. */
  const hostile = (): Record<string, unknown> =>
    JSON.parse(
      '{"__proto__":{"pwned":true},"keep":"yes","tail":"t"}',
    ) as Record<string, unknown>;

  const mk = (): Router =>
    createRouter([
      { name: "h", path: "/h" },
      { name: "q", path: "/q?keep&tail" },
      { name: "p", path: "/p/:id" },
    ]);

  /** Both halves of "the key is not here": no own entry, and no swapped prototype. */
  const assertClean = (bag: object, where: string): void => {
    expect(
      Object.getOwnPropertyNames(bag),
      `own keys of ${where}`,
    ).not.toContain("__proto__");
    expect(
      Object.getPrototypeOf(bag),
      `prototype of ${where} is untouched`,
    ).toBe(Object.prototype);
    expect(
      (bag as Record<string, unknown>).pwned,
      `a swapped prototype would make this readable on ${where}`,
    ).toBeUndefined();
  };

  describe("an ordinary bag — the case the rule exists for", () => {
    it("cannot reach state.search, and the keys after it still survive", async () => {
      router = mk();

      await router.start("/h");
      await router.navigate("q", {}, hostile() as SearchParams);

      const committed = router.getState()!.search;

      assertClean(committed, "state.search");

      expect(
        Object.getOwnPropertyNames(committed).toSorted((a, b) =>
          a.localeCompare(b),
        ),
        "the keys AFTER the hostile one are still copied",
      ).toStrictEqual(["keep", "tail"]);
    });

    it("cannot reach state.params either", async () => {
      router = mk();

      await router.start("/h");
      await router.navigate("p", {
        ...hostile(),
        id: "7",
      } as unknown as Params);

      const committed = router.getState()!.params;

      assertClean(committed, "state.params");

      expect(Object.getOwnPropertyNames(committed)).toContain("id");
    });

    it("cannot reach it when merged UNDER a route default", async () => {
      // A route with its own default takes a different branch of the merge than
      // the default-less one the cells above exercise.
      router = createRouter([
        { name: "h", path: "/h" },
        { name: "w", path: "/w?keep&other", defaultSearch: { other: "d" } },
      ]);

      await router.start("/h");
      await router.navigate("w", {}, hostile() as SearchParams);

      const committed = router.getState()!.search;

      assertClean(committed, "state.search merged under a default");

      expect(
        Object.getOwnPropertyNames(committed).toSorted((a, b) =>
          a.localeCompare(b),
        ),
        "the honest keys survive the merge",
      ).toStrictEqual(["keep", "other", "tail"]);
    });

    // eslint-disable-next-line vitest/expect-expect -- assertions live in assertClean()
    it("cannot reach it through a route default the caller still holds", async () => {
      // The store keeps the caller's own defaults object and re-reads it on every
      // navigation, so a check at registration time is a snapshot of a value the
      // caller can still change. No accessor is needed — a plain write suffices.
      //
      // ⚠ The sibling key is DECLARED on purpose. With an undeclared one the mode
      // gate arms under `default` / `strict`, and its fresh accumulator launders
      // a swapped prototype away — the cell would then pass on broken code in two
      // of the three modes.
      router = createRouter([
        { name: "h", path: "/h" },
        { name: "x", path: "/x?keep&other", defaultSearch: { keep: "1" } },
      ]);

      await router.start("/h");

      const live = getRoutesApi(router).get("x")!.defaultSearch as Record<
        string,
        unknown
      >;

      Object.defineProperty(live, "__proto__", {
        value: { pwned: true },
        enumerable: true,
        writable: true,
        configurable: true,
      });

      await router.navigate("x", {}, { other: "2" });

      assertClean(router.getState()!.search, "state.search");
    });

    it("is dropped from a URL, which never throws for it", async () => {
      // Asserts on `matchPath`'s RETURN — this door commits nothing.
      //
      // ⚑ The payload is the key TWICE, and that is what makes this a pin
      // rather than a gesture. An earlier revision of this comment called the
      // cell "defence in depth" because "a URL can only carry a STRING, and the
      // setter swallows a primitive" — measured, that is false: a repeated name
      // is accumulated into an ARRAY (`engine/search-params`, written through
      // `assignParam`'s `defineProperty`), and assigning an array to this name
      // DOES swap the target's prototype. So a URL can hand a copy site exactly
      // the object-valued payload the rest of this file uses, and with the
      // guard gone `assertClean` reds here like everywhere else.
      router = mk();

      await router.start("/h");

      const matched = getPluginApi(router).matchPath(
        "/q?__proto__=a&__proto__=b&keep=yes&tail=t",
      );

      expect(matched, "a URL carrying the key still matches").toBeDefined();

      assertClean(matched!.search, "matchPath().search");

      expect(
        Object.getOwnPropertyNames(matched!.search).toSorted((a, b) =>
          a.localeCompare(b),
        ),
      ).toStrictEqual(["keep", "tail"]);
    });

    it("does not survive an undefined-valued sibling forcing the strip copy", async () => {
      // The `undefined` strip and the key skip share a walk; a trailing
      // `undefined` key is what makes over-running that walk observable.
      const bag = hostile();

      bag.gone = undefined;

      router = mk();

      await router.start("/h");
      await router.navigate("q", {}, bag as SearchParams);

      const committed = router.getState()!.search;

      assertClean(committed, "state.search");

      expect(
        Object.getOwnPropertyNames(committed),
        "the undefined-valued key is stripped, the honest ones are not",
      ).not.toContain("gone");
    });
  });

  describe("a bag that changes while the router reads it", () => {
    // eslint-disable-next-line vitest/expect-expect -- assertions live in assertClean()
    it("still cannot reach state, because each copy names the key unconditionally", async () => {
      // ⚑ Not promised by the contract (see `UNSAFE_KEY` in `constants.ts`) — it
      // holds because no guard carries a reachability argument. An earlier
      // revision omitted the guard on one copy, reasoning that an upstream walk
      // had already removed the key; a getter on a sibling defines `__proto__` on
      // its own object mid-walk, after that walk has passed the point and before
      // the copy runs, and the key shipped into `state.search`.
      const late: Record<string, unknown> = {};

      Object.defineProperty(late, "keep", {
        enumerable: true,
        configurable: true,
        get: () => {
          if (!Object.hasOwn(late, "__proto__")) {
            Object.defineProperty(late, "__proto__", {
              value: { pwned: true },
              enumerable: true,
              writable: true,
              configurable: true,
            });
          }

          return "yes";
        },
      });

      router = mk();

      await router.start("/h");
      await router.navigate("q", {}, late as SearchParams);

      assertClean(router.getState()!.search, "state.search");
    });

    it("rejects rather than throwing when its accessor throws", async () => {
      // The copies read every value, and this door's contract is to REJECT: URL
      // plugins call it from popstate handlers, and `memory-plugin`'s `go()`
      // attaches only `.catch()`, so a synchronous throw escapes into
      // `router.back()`.
      const throwing: Record<string, unknown> = {};

      Object.defineProperty(throwing, "keep", {
        enumerable: true,
        get: () => {
          throw new Error("BOOM");
        },
      });

      router = mk();

      await router.start("/h");

      let threwSynchronously = false;
      let rejected = false;

      try {
        await getPluginApi(router)
          .navigateToState({
            name: "q",
            params: {},
            search: throwing as SearchParams,
            path: "/q",
          } as never)
          .catch(() => {
            rejected = true;
          });
      } catch {
        threwSynchronously = true;
      }

      expect(threwSynchronously, "must not throw synchronously").toBe(false);
      expect(rejected, "must reject so `.catch()` sees it").toBe(true);
    });
  });

  describe("every door that COMMITS a state builds its own copy", () => {
    it("navigateToState: not the caller's object, frozen, immune to later mutation", async () => {
      router = mk();

      await router.start("/h");

      const held: Record<string, unknown> = { keep: "yes" };

      await getPluginApi(router).navigateToState({
        name: "q",
        params: {},
        search: held as SearchParams,
        path: "/q?keep=yes",
      } as never);

      const committed = router.getState()!.search;

      expect(committed, "committed search is not the caller's object").not.toBe(
        held,
      );
      expect(Object.isFrozen(committed), "committed search is frozen").toBe(
        true,
      );

      Object.defineProperty(held, "__proto__", {
        value: { pwned: true },
        enumerable: true,
        writable: true,
        configurable: true,
      });

      assertClean(router.getState()!.search, "state.search after the mutation");
    });

    it("navigateToState: cleans the PARAMS channel too, not only search", async () => {
      // Every other cell on this door passes `params: {}`, which cannot tell a
      // working copy from a missing one.
      router = mk();

      await router.start("/h");

      await getPluginApi(router).navigateToState({
        name: "p",
        params: { ...hostile(), id: "7" } as unknown as Params,
        search: {},
        path: "/p/7",
      } as never);

      const committed = router.getState()!.params;

      assertClean(committed, "state.params from navigateToState");

      expect(Object.getOwnPropertyNames(committed)).toContain("id");
    });

    // eslint-disable-next-line vitest/expect-expect -- assertions live in assertClean()
    it("navigateToState: cleans a bag hostile at the moment of the call", async () => {
      router = mk();

      await router.start("/h");

      await getPluginApi(router).navigateToState({
        name: "q",
        params: {},
        search: hostile() as SearchParams,
        path: "/q?keep=yes",
      } as never);

      assertClean(router.getState()!.search, "state.search");
    });

    it("systemCommit: the fourth door, reached through the published internals", async () => {
      // `getInternals` is exported from `@real-router/core/validation` and four
      // first-party packages use it, so this door takes a State someone else
      // built — and the FSM commits by freezing the SHELL only.
      router = mk();

      await router.start("/h");

      const base = getPluginApi(router).makeState(
        "q",
        {},
        {
          keep: "yes",
        },
      ) as unknown as State;
      const bag = hostile();

      getInternals(router).systemCommit(
        { ...base, search: bag as SearchParams },
        router.getState(),
        {},
      );

      const committed = router.getState()!.search;

      assertClean(committed, "state.search after systemCommit");

      expect(committed, "not the caller's object").not.toBe(bag);
      expect(Object.isFrozen(committed), "frozen").toBe(true);
    });

    it("both doors own the THIRD channel too, and it keeps what context keeps", async () => {
      // The describe says "builds its own copy", and for a while one door built
      // two thirds of one: `systemCommit` spread the state, which carries
      // `context` by REFERENCE, so the committed context stayed writable
      // through the handle the caller kept — the same defect named for `params`
      // and `search`, hiding in the third channel because a spread looks like a
      // copy. What that fixes is OWNERSHIP, not mutability: `context` is the
      // documented mutable carve-out and stays one.
      //
      // The second half is the contrast this whole file draws. The state
      // channels DROP the key; `context` KEEPS it, because a plugin may claim a
      // namespace under that name (#1191 / #1788). A copy that quietly lost it
      // would break the other contract while fixing this one.
      router = mk();

      await router.start("/h");

      const base = getPluginApi(router).makeState(
        "q",
        {},
        { keep: "yes" },
      ) as unknown as State;

      const held: Record<string, unknown> = { ns: "claimed" };

      getInternals(router).systemCommit(
        { ...base, context: held },
        router.getState(),
        {},
      );

      const committed = router.getState()!.context;

      expect(committed, "not the caller's object").not.toBe(held);
      expect(committed.ns, "what the caller already wrote survives").toBe(
        "claimed",
      );

      held.afterTheFact = "LEAK";

      expect(
        committed.afterTheFact,
        "a write through the caller's handle no longer lands in committed state",
      ).toBeUndefined();

      getInternals(router).systemCommit(
        { ...base, context: hostile() },
        router.getState(),
        {},
      );

      const withNamespace = router.getState()!.context;

      expect(
        Object.getOwnPropertyNames(withNamespace),
        "a namespace claimed under the name survives — context is not a state channel",
      ).toContain("__proto__");
      expect(
        Object.getPrototypeOf(withNamespace),
        "kept as an own key, not applied as a prototype",
      ).toBe(Object.prototype);

      // ⚠ "Both doors" has to MEAN both. An earlier revision of this cell drove
      // `systemCommit` twice and never called `navigateToState`, so the copy on
      // that door could be deleted with the whole suite green — a cell named for
      // a two-door property, measuring one.
      const otherHeld: Record<string, unknown> = { ns: "claimed" };

      await getPluginApi(router).navigateToState({
        ...base,
        path: "/q?keep=other",
        search: { keep: "other" },
        context: otherHeld,
      });

      const otherCommitted = router.getState()!.context;

      expect(
        otherCommitted,
        "navigateToState: not the caller's object",
      ).not.toBe(otherHeld);
      expect(otherCommitted.ns, "and it kept what was already written").toBe(
        "claimed",
      );

      otherHeld.afterTheFact = "LEAK";

      expect(
        otherCommitted.afterTheFact,
        "navigateToState: a later write through the caller's handle does not land",
      ).toBeUndefined();
    });

    it("the shell is core's own object too, not a spread of the caller's", async () => {
      // The channels were clean at this door while the SHELL was not: it was
      // built by `{ ...toState }`, and a spread DEFINES — so a foreign State
      // carrying an own `__proto__` handed the key straight onto the committed
      // state. Nothing in `state.params` or `state.search`, and therefore
      // invisible to every other cell here, but `Object.assign(x, getState())`
      // swapped `x`'s prototype and `JSON.stringify(getState())` carried the key
      // into the SSR payload.
      router = mk();

      await router.start("/h");

      const base = getPluginApi(router).makeState(
        "q",
        {},
        { keep: "yes" },
      ) as unknown as State;
      const foreign = hostile();

      foreign.name = "q";
      foreign.params = {};
      foreign.search = { keep: "yes" };
      foreign.path = "/q?keep=yes";
      foreign.context = {};
      foreign.transition = base.transition;

      getInternals(router).systemCommit(
        foreign as unknown as State,
        router.getState(),
        {},
      );

      const committed = router.getState()!;

      assertClean(committed, "the committed state SHELL");

      expect(
        Object.getOwnPropertyNames(committed).toSorted((a, b) =>
          a.localeCompare(b),
        ),
        "exactly the six fields of a State — a foreign extra rides nowhere",
      ).toStrictEqual([
        "context",
        "name",
        "params",
        "path",
        "search",
        "transition",
      ]);

      const victim: Record<string, unknown> = { ...committed };

      expect(
        Object.getPrototypeOf(victim),
        "merging a committed state must not be a pollution primitive",
      ).toBe(Object.prototype);
    });

    it("the shell's own fields are core's too — transition copied, frozen, in producer order", async () => {
      // `transition` was the one field still travelling by reference after the
      // shell was rebuilt field by field, and it is the same defect as the other
      // three: the caller kept a live handle to a `TransitionMeta` the router
      // published, so `getState().transition.phase` could be rewritten AFTER the
      // commit and an own `__proto__` on it rode into `JSON.stringify(getState())`.
      //
      // The key ORDER is asserted for a separate reason: every other producer
      // emits these six in one order, and a literal that emits another gives the
      // committed state a second hidden class.
      router = mk();

      await router.start("/h");

      const base = getPluginApi(router).makeState(
        "q",
        {},
        { keep: "yes" },
      ) as unknown as State;
      const held = { ...base.transition, ...hostile() };

      getInternals(router).systemCommit(
        { ...base, transition: held },
        router.getState(),
        {},
      );

      const committed = router.getState()!;

      expect(committed.transition, "not the caller's object").not.toBe(held);
      expect(Object.isFrozen(committed.transition), "frozen").toBe(true);

      assertClean(committed.transition, "the committed transition");

      expect(
        Object.getOwnPropertyNames(committed),
        "the same field order every other producer emits",
      ).toStrictEqual(
        Object.getOwnPropertyNames(
          getPluginApi(router).makeState(
            "q",
            {},
            { keep: "z" },
          ) as unknown as State,
        ),
      );
    });

    it("a State with no transition commits without one, not with a borrowed empty", async () => {
      // The copy must not invent the field it is copying. Written flat, the
      // guarded copier's empty answer is the shared `EMPTY_PARAMS` singleton —
      // so a foreign State with no `transition` committed a frozen `{}` typed as
      // `TransitionMeta` (which declares `phase`, `reason` and `segments` as
      // required), and `getState().transition` was the SAME OBJECT as some other
      // state's `getState().params`. Absence stays absence.
      router = mk();

      await router.start("/h");

      const base = getPluginApi(router).makeState(
        "q",
        {},
        { keep: "yes" },
      ) as unknown as State;
      const withoutTransition = Object.fromEntries(
        Object.entries(base as unknown as Record<string, unknown>).filter(
          ([key]) => key !== "transition",
        ),
      );

      getInternals(router).systemCommit(
        withoutTransition as unknown as State,
        router.getState(),
        {},
      );

      const committed = router.getState()!;

      expect(
        Object.hasOwn(committed, "transition"),
        "no key, rather than a key holding a borrowed empty object",
      ).toBe(false);
      expect(
        (committed as unknown as Record<string, unknown>).transition,
        "and certainly not the params singleton",
      ).not.toBe(committed.params);
    });

    it("the machine is asked with nothing running between the ask and the send", async () => {
      // Not about `__proto__` — about what the copies cost. They READ every
      // value of four caller-supplied slots, which is a call into application
      // code; when the FSM was asked ABOVE them, that code sat in the gap
      // between the ask and the send. An accessor calling `stop()` from there
      // left the ask already answered and the send a silent no-op, so this door
      // returned a fully-formed State that was never committed, with no throw —
      // the outcome `internals.ts` says this throw exists to prevent (#1186).
      router = mk();

      await router.start("/h");

      const base = getPluginApi(router).makeState(
        "q",
        {},
        { keep: "yes" },
      ) as unknown as State;
      const search: Record<string, unknown> = {};

      Object.defineProperty(search, "keep", {
        enumerable: true,
        configurable: true,
        get(): string {
          router.stop();

          return "yes";
        },
      });

      expect(() =>
        getInternals(router).systemCommit(
          { ...base, search: search as SearchParams },
          router.getState(),
          {},
        ),
      ).toThrow(/cannot commit/i);

      expect(
        router.getState(),
        "and nothing was committed on the way to that throw",
      ).toBeUndefined();
    });

    it("a door that copies still hands back the object it committed", async () => {
      // The copies above are the whole point of this file, and they cost this
      // if nobody watches: `navigateToNotFound` used to `return` the very state
      // it passed to the commit, so once the door started copying, application
      // code got a state the router does not hold — value-equal, frozen, and
      // not `===` `getState()`. `start()` inherits it on the not-found branch.
      // Not about `__proto__`; caused by the fix for it.
      const local = createRouter([{ name: "h", path: "/h" }], {
        allowNotFound: true,
      });

      const started = await local.start("/nope");
      const startIsCommitted = started === local.getState();
      const returned = local.navigateToNotFound("/gone");
      const notFoundIsCommitted = returned === local.getState();

      local.dispose();

      router = mk();

      expect(
        { startIsCommitted, notFoundIsCommitted },
        "a producer returns what the router holds, or it returns a ghost",
      ).toStrictEqual({ startIsCommitted: true, notFoundIsCommitted: true });
    });

    it("systemCommit: cleans the PARAMS channel too, not only search", async () => {
      // The door's other cell passes `params` straight from `makeState` and a
      // hostile `search`, so it exercises one of the two channels and the other
      // half of the copy can be deleted with the whole suite still green. Same
      // asymmetry the `navigateToState` cell above exists to close.
      router = mk();

      await router.start("/h");

      const base = getPluginApi(router).makeState(
        "p",
        { id: "7" },
        {},
      ) as unknown as State;
      const bag = { ...hostile(), id: "7" } as unknown as Params;

      getInternals(router).systemCommit(
        { ...base, params: bag },
        router.getState(),
        {},
      );

      const committed = router.getState()!.params;

      assertClean(committed, "state.params after systemCommit");

      expect(committed, "not the caller's object").not.toBe(bag);
      expect(Object.isFrozen(committed), "frozen").toBe(true);
      expect(
        Object.getOwnPropertyNames(committed),
        "the ordinary key beside it survives",
      ).toContain("id");
    });
  });

  describe("the seam reads the slots it checks", () => {
    it("cannot check one route's declarations and commit another route", async () => {
      // Not about `__proto__` — about the shape the copy sites cannot fix. The
      // seam reads `name` to pick the declarations it validates against, and
      // reads it again for the object it returns. `state.name` is the observable,
      // so nothing downstream can mask it.
      router = createRouter([
        { name: "h", path: "/h" },
        { name: "c", path: "/c" },
        { name: "other", path: "/other" },
      ]);

      await router.start("/h");

      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, name, params, search) => {
          const result = next(name, params, search);

          if (name !== "c") {
            return result;
          }

          let reads = 0;

          return {
            ...result,
            get name(): string {
              return ++reads <= 1 ? "c" : "other";
            },
          };
        },
      );

      await router.navigate("c").catch(() => undefined);

      expect(
        router.getState()!.name,
        "the committed route is the one the seam resolved and checked",
      ).toBe("c");
    });

    it("cannot clear the params bag for the check and refill it for the commit", async () => {
      // The `name` cell above pins one slot of the same seam; this pins the
      // other, and they fail on different edits. `params` is read once for the
      // channel check and once for the object the seam returns, so an
      // accessor-backed chain result can show an EMPTY bag to the guard and a
      // bag carrying a DECLARED QUERY KEY to the commit — and `keep` lands in
      // the path channel, which is exactly what the guard exists to refuse.
      router = mk();

      await router.start("/h");

      getPluginApi(router).addInterceptor(
        "forwardState",
        (next, name, params, search) => {
          const result = next(name, params, search);

          if (name !== "q") {
            return result;
          }

          let reads = 0;

          return {
            ...result,
            get params(): Params {
              return ++reads <= 1 ? {} : { keep: "SHIPPED" };
            },
          };
        },
      );

      await router.navigate("q").catch(() => undefined);

      expect(
        Object.getOwnPropertyNames(router.getState()!.params),
        "a declared query key must never reach the path channel",
      ).not.toContain("keep");
    });
  });

  describe("the answer does not depend on the query mode", () => {
    it("all three modes, both channels", async () => {
      // ⚠ Every other cell in this file runs in `loose`, the default, and none
      // of them says so. That is not neutral: under `default` and `strict` the
      // mode gate builds a FRESH accumulator, which would launder a swapped
      // prototype and could make a cell green for a reason that has nothing to
      // do with the guard it names. So the headline shape is swept across all
      // three here, and a cell elsewhere that only holds in `loose` is a cell
      // this one would not save.
      const answers: Record<string, unknown> = {};

      for (const mode of ["loose", "default", "strict"] as const) {
        const local = createRouter(
          [
            { name: "h", path: "/h" },
            { name: "q", path: "/q?keep&tail" },
            { name: "p", path: "/p/:id" },
          ],
          { queryParamsMode: mode },
        );

        await local.start("/h");
        await local.navigate("q", {}, hostile() as SearchParams);

        const search = local.getState()!.search;

        await local.navigate("p", { ...hostile(), id: "7" } as Params);

        const params = local.getState()!.params;

        answers[mode] = {
          search: Object.getOwnPropertyNames(search).toSorted((a, b) =>
            a.localeCompare(b),
          ),
          searchProto: Object.getPrototypeOf(search) === Object.prototype,
          params: Object.getOwnPropertyNames(params).toSorted((a, b) =>
            a.localeCompare(b),
          ),
          paramsProto: Object.getPrototypeOf(params) === Object.prototype,
        };

        local.dispose();
      }

      router = mk();

      const expected = {
        search: ["keep", "tail"],
        searchProto: true,
        // The siblings the hostile bag carries stay — they are ordinary own
        // keys of the path bag, and this route declares no query names for them
        // to collide with. Identical in all three modes, which is the point.
        params: ["id", "keep", "tail"],
        paramsProto: true,
      };

      expect(answers, "one answer in every mode").toStrictEqual({
        loose: expected,
        default: expected,
        strict: expected,
      });
    });
  });

  describe("the depth the promise stops at", () => {
    it("CONTROL — a nested bag is kept BY REFERENCE, key and all, deliberately", async () => {
      // The promise is about the channel's OWN keys, and this cell exists so the
      // boundary is measured rather than assumed. Every copy here is
      // `copy[key] = value`, so an object-valued entry is a reference: the inner
      // bag stays the caller's, unfrozen, with whatever keys it had. If this
      // cell ever goes green on "the inner bag is a copy", the copies went deep
      // and the promise in `constants.ts` is understating what the router does.
      router = mk();

      await router.start("/h");

      const inner = hostile();
      const outer = { keep: "yes", blob: inner } as unknown as SearchParams;

      await router.navigate("q", {}, outer);

      const committed = router.getState()!.search as Record<string, unknown>;

      assertClean(committed, "the channel's own level");

      expect(committed.blob, "the nested value is the caller's object").toBe(
        inner,
      );
      expect(
        Object.isFrozen(committed.blob as object),
        "and the freeze is one level deep too",
      ).toBe(false);
      expect(
        Object.getOwnPropertyNames(committed.blob as object),
        "with the key still on it — this is the documented edge, not a leak of the top level",
      ).toContain("__proto__");
    });
  });

  describe("controls", () => {
    it("CONTROL — a symbol is dropped whatever else the bag carries", async () => {
      // Not about `__proto__`, but held by the same copy sites, and it is how
      // the split between them was found. `mergeWithDefault` has two exits — the
      // strip copy and its own loop — and while the strip copy was a spread, a
      // spread carried symbol-keyed entries and the loop did not. So whether a
      // symbol survived a navigation turned on whether some UNRELATED key
      // happened to hold `undefined`. Three shapes, one answer, or the two
      // exits have drifted apart again.
      const marker = Symbol("marker");
      const withMarker = (bag: Record<string, unknown>): SearchParams => {
        (bag as Record<symbol, string>)[marker] = "carried";

        return bag as SearchParams;
      };

      const symbolsAfter = async (bag: SearchParams): Promise<number> => {
        const local = createRouter([
          { name: "h", path: "/h" },
          { name: "q", path: "/q?keep&tail" },
        ]);

        await local.start("/h");
        await local.navigate("q", {}, bag);

        const count = Object.getOwnPropertySymbols(
          local.getState()!.search,
        ).length;

        local.dispose();

        return count;
      };

      router = mk();

      expect(
        {
          plain: await symbolsAfter(withMarker({ keep: "1" })),
          besideAnUndefined: await symbolsAfter(
            withMarker({ keep: "1", tail: undefined }),
          ),
          besideTheUnsafeKey: await symbolsAfter(withMarker(hostile())),
        },
        "dropped in all three, or the copy sites disagree",
      ).toStrictEqual({
        plain: 0,
        besideAnUndefined: 0,
        besideTheUnsafeKey: 0,
      });
    });

    it("CONTROL — the other eleven inherited names travel normally", async () => {
      // If this reds, the rule stopped being about `__proto__` and became a ban
      // on prototype member names, which is a different and wrong contract.
      const names = [
        "constructor",
        "hasOwnProperty",
        "isPrototypeOf",
        "propertyIsEnumerable",
        "toLocaleString",
        "toString",
        "valueOf",
        "__defineGetter__",
        "__defineSetter__",
        "__lookupGetter__",
        "__lookupSetter__",
      ];

      router = createRouter([
        { name: "h", path: "/h" },
        { name: "m", path: `/m?${names.join("&")}` },
      ]);

      await router.start("/h");

      const bag = Object.fromEntries(
        names.map((n) => [n, "v"]),
      ) as SearchParams;

      await router.navigate("m", {}, bag);

      expect(
        Object.getOwnPropertyNames(router.getState()!.search).toSorted((a, b) =>
          a.localeCompare(b),
        ),
        "all eleven survive",
      ).toStrictEqual([...names].toSorted((a, b) => a.localeCompare(b)));
    });
  });
});
