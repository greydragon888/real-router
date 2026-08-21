import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * The URL BUILD direction must decide "did the caller fill this slot?" with an
 * OWN-property test, because the route — not the caller — supplies the name
 * (#1798).
 *
 * Two reads in `engine/path-matcher/SegmentMatcher.ts` asked that question with
 * a lookup that walks the prototype chain:
 *
 *     for (const name of route.declaredQueryParams) {   // :299
 *       if (!(name in params)) { continue; }
 *       queryObj[name] = params[name];
 *
 *     const value = params?.[slot.paramName];           // :236
 *     if (value === undefined || value === null) { throw … "Missing required param" }
 *
 * For an `Object.prototype` member an EMPTY bag answers "yes" and hands back the
 * native method, which produces two distinct failures:
 *
 *   - a `?name` route PRINTS the serialized function into the href, while the
 *     committed `state.search` stays empty — a state that contradicts its own
 *     path, which is exactly what the always-on mode gate (#1575) exists to make
 *     impossible, and which `matchPath(state.path)` then resurrects as a real
 *     query value on every popstate;
 *   - a `:name` slot BYPASSES the required-param guard, because the
 *     `undefined`/`null` test never sees `undefined` — it sees the method.
 *
 * ⚑ Written as a TABLE over every inherited name × both declaration sites,
 * because the defect belongs to the READ PRIMITIVE and not to one key. The issue
 * named seven affected names; measured against `src`, the query direction leaks
 * ELEVEN of the twelve and the path slot bypasses on ALL twelve — the four
 * `__defineGetter__` / `__defineSetter__` / `__lookupGetter__` /
 * `__lookupSetter__` members were missing from that list.
 *
 * ⚑ `__proto__` is the one asymmetric cell, and it is asymmetric only on the
 * QUERY axis. ⚠ The reason is NOT that the query builder drops objects — it does
 * not, it stringifies them (`build({a: Object.prototype})` yields
 * `a=%5Bobject%20Object%5D`, measured; what `build` drops is `undefined`). The
 * reason is the WRITE one line further on: `queryObj[name] = params[name]` for
 * this one name hits `Object.prototype`'s setter, so no own key is created and
 * `build` is handed an empty bag. On a PATH slot there is no such write, and
 * `__proto__` bypasses the guard like every other name (it printed `/a/%7B%7D`).
 * Keeping both axes in one table is what makes that visible instead of letting
 * "`__proto__` escapes" read as a property of the name rather than of one
 * direction — and the write it names is the #1792 half, which SHIPPED in core
 * 0.94.0 while this branch was open. Its effect on the two `__proto__` cells is
 * recorded where they measure it, not here.
 *
 * The sibling eleven lines below the first defect — the `loose` arm at
 * `SegmentMatcher.ts:310` — already asks the identical question with
 * `Object.hasOwn` and answers right, and `channels/defaults.ts:48-58` states the
 * rule by name for the same reason. This file pins the printer onto it.
 */
describe("the URL build direction reads a declared name off the caller's bag (#1798)", () => {
  /**
   * Derived from the runtime rather than hand-listed: a hand-written enumeration
   * of this set is exactly what the issue got wrong (seven of twelve), and a
   * derived one cannot drift when an engine adds a member. The non-vacuity cell
   * at the bottom pins the derivation itself.
   */
  const INHERITED = Object.getOwnPropertyNames(Object.prototype);

  /** An ordinary name — the column that stops the table collapsing into "everything is empty". */
  const ORDINARY = "page";

  const NAMES = [...INHERITED, ORDINARY];

  /**
   * A pure DESCRIBER, not an assertion helper: the three facts that together say
   * "the empty bag filled nothing" are compared in ONE `expect`, so a failure
   * shows which of them broke instead of stopping at the first.
   *
   * `committedPath` is in here beside `href` deliberately — the two producers
   * disagreeing is the #1552/#1578 shape, and `searchKeys` alone cannot see it
   * (before the fix `state.search` was legitimately empty while `state.path`
   * carried a value for the key).
   */
  const describeQueryDirection = async (
    key: string,
  ): Promise<Record<string, unknown>> => {
    const router = createRouter([
      { name: "a", path: `/a?${key}` },
      { name: "home", path: "/home" },
    ]);

    await router.start("/home");

    const href = router.buildPath("a", {}, {});
    const state = await router.navigate("a", {}, {});

    const described = {
      href,
      committedPath: state.path,
      searchKeys: Object.keys(state.search),
    };

    router.dispose();

    return described;
  };

  /** The one shape the query direction must produce for a slot nobody filled. */
  const EMPTY_QUERY = {
    href: "/a",
    committedPath: "/a",
    searchKeys: [],
  };

  /**
   * Reports WHAT happened rather than a boolean, so an accepted navigation names
   * the path it produced instead of failing as a bare `false`.
   */
  const refusalOf = async (
    attempt: () => Promise<string> | string,
  ): Promise<string> => {
    try {
      return `accepted: ${await attempt()}`;
    } catch (error) {
      return (error as Error).message.includes("Missing required param")
        ? "refused"
        : `threw: ${(error as Error).message}`;
    }
  };

  const describeSlotDirection = async (
    key: string,
  ): Promise<Record<string, unknown>> => {
    const router = createRouter([
      { name: "a", path: `/a/:${key}` },
      { name: "home", path: "/home" },
    ]);

    await router.start("/home");

    const described = {
      buildPath: await refusalOf(() => router.buildPath("a", {})),
      navigate: await refusalOf(async () => {
        const state = await router.navigate("a", {});

        return state.path;
      }),
    };

    router.dispose();

    return described;
  };

  /** Both producers must refuse a required slot the caller did not fill. */
  const REFUSED_SLOT = { buildPath: "refused", navigate: "refused" };

  /**
   * The FILLED column, and it is what keeps the table honest: everything above
   * asserts an ABSENCE, so a fix that simply refused every `Object.prototype`
   * name outright would satisfy all of it. The rule being pinned is
   * own-vs-inherited, not "this name is forbidden" — a route may legitimately
   * declare `?toString`, and a caller who really supplies that key must still get
   * it printed, committed and round-tripped.
   *
   * ⚠ Fixtures use `JSON.parse`, not a literal: in source `{ __proto__: x }` sets
   * the prototype and creates no own entry, while a parsed or computed key
   * creates the own entry (measured, both) — so a hand-written literal cannot
   * express the input for the one accessor in the set.
   */
  const describeFilledQuery = async (
    key: string,
  ): Promise<Record<string, unknown>> => {
    const router = createRouter(
      [
        { name: "a", path: `/a?${key}` },
        { name: "home", path: "/home" },
      ],
      { queryParamsMode: "default" },
    );

    await router.start("/home");

    const bag = JSON.parse(`{"${key}":"REAL"}`) as Record<string, string>;
    const state = await router.navigate("a", {}, bag);
    const matched = getPluginApi(router).matchPath(state.path);

    const described = {
      href: router.buildPath("a", {}, bag),
      committedSearch: { ...state.search },
      // The mode gate's own invariant (#1575): what the path shows is what the
      // state carries, so a re-parse of the committed path reproduces the key.
      roundTripped: Object.hasOwn(matched?.search ?? {}, key),
    };

    router.dispose();

    return described;
  };

  const buildFilledSlot = (key: string): string => {
    const router = createRouter([
      { name: "b", path: `/b/:${key}` },
      { name: "home", path: "/home" },
    ]);

    try {
      return router.buildPath("b", JSON.parse(`{"${key}":"REAL"}`) as never);
    } finally {
      router.dispose();
    }
  };

  /**
   * `__proto__` is excluded from BOTH filled columns, and each exclusion has a
   * pinned cell of its own below rather than a silent `filter`.
   *
   * The reason is the same in both, and it is not this defect: the read corrected
   * here answers correctly for a bag that still HAS the key, but on this one name
   * a plain assignment upstream has already dropped it. That is the WRITE half of
   * the same class — `__proto__` is the only ACCESSOR among `Object.prototype`'s
   * twelve own members, so `dst[key] = value` dispatches into its setter instead
   * of creating an entry. Closed as #1792 (core 0.94.0) for the two state
   * channels; the write in `#buildQueryStringForBuild` four lines below the
   * fixed read is NOT in that radius and still drops the key.
   *
   * ⚠ Measured, and only the QUERY cell is identical before and after: on the
   * slot axis `master` BUILDS `/b/%7B%7D` for `__proto__` where this fix throws
   * `Missing required param`, because the read is exactly what changed there. An
   * earlier draft of this line claimed both axes were unaffected.
   */
  const FILLABLE = NAMES.filter((name) => name !== "__proto__");

  describe.each(NAMES)("%s", (key) => {
    it("a `?name` route with an empty bag builds a bare path and commits an empty query", async () => {
      await expect(describeQueryDirection(key)).resolves.toStrictEqual(
        EMPTY_QUERY,
      );
    });

    it("a `:name` slot with an empty bag is refused by both producers", async () => {
      await expect(describeSlotDirection(key)).resolves.toStrictEqual(
        REFUSED_SLOT,
      );
    });
  });

  it.each(FILLABLE)(
    "a `?%s` route printing a key the caller really supplied",
    async (key) => {
      await expect(describeFilledQuery(key)).resolves.toStrictEqual({
        href: `/a?${key}=REAL`,
        committedSearch: { [key]: "REAL" },
        roundTripped: true,
      });
    },
  );

  it.each(FILLABLE)("a filled `:%s` slot still builds", (key) => {
    expect(buildFilledSlot(key)).toBe("/b/REAL");
  });

  it("BOUNDARY — a filled `__proto__` is still lost, by the WRITE half (#1792)", async () => {
    // Pinned rather than filtered out, so the line between the two halves of this
    // class stays visible instead of becoming a silent gap in the table.
    //
    // On the SLOT, `normalizeParams` (`core/src/helpers.ts`) plain-assigns the
    // caller's keys, so the own entry is gone before this read ever runs and the
    // required-param guard — now asking the right question — correctly reports
    // the slot as unfilled.
    //
    // On the QUERY, the read admits the key (it IS own) and the very next line
    // writes it with `queryObj[name] = params[name]`, which is the same
    // primitive: the value is dropped and the href comes back bare. That write is
    // untouched by both #1792 and this change — `git show 38d405959 --stat` does
    // not name `SegmentMatcher.ts` — so the href stays `/a` on every revision.
    //
    // ⚑ REBASED ONTO #1792, and the note that stood here was wrong in three
    // ways. It read: "when #1792 lands, BOTH halves of this cell go RED — delete
    // it and move `__proto__` back into `FILLABLE`."
    //
    //   1. ONE half reds, not both. The slot half still throws: #1792 drops the
    //      key in `normalizeParams` before this read runs, exactly as the
    //      paragraph above says, so `buildFilledSlot` is unchanged.
    //   2. What reds is `committedSearch`, which went `{ __proto__: "REAL" }` →
    //      `{}`. #1792's guarantee is that the key cannot appear among the OWN
    //      KEYS of `state.search`; this cell was pinning the pre-guarantee value.
    //   3. Moving `__proto__` into `FILLABLE` would red all THREE assertions of
    //      that column, which expects `/a?__proto__=REAL`, `{__proto__:"REAL"}`
    //      and `roundTripped: true`. After #1792 the key is MORE excluded, not
    //      less — the opposite of what the note instructed.
    //
    // What the cell buys after the rebase is sharper than before: the href was
    // always bare, and now `state.search` is empty too, so the mode-gate
    // contradiction it used to record (`state.search` ⊄ what `state.path` shows)
    // is CLOSED — by #1792, not by this branch. It is pinned here because a
    // future change to either half would re-open it silently.
    expect(() => buildFilledSlot("__proto__")).toThrow(
      "Missing required param '__proto__'",
    );

    await expect(describeFilledQuery("__proto__")).resolves.toStrictEqual({
      href: "/a",
      committedSearch: {},
      roundTripped: false,
    });
  });

  it("BOUNDARY — the codec seam is the one bag this read sees unnormalised", async () => {
    // Two facts the empty-bag table cannot show, both about `encodeParams`:
    // `RoutesNamespace` forwards a codec's return value to the matcher VERBATIM,
    // so it is the only bag that reaches this read without passing through
    // `normalizeParams`. Hence (a) the nullish half of the guard is load-bearing
    // — `Object.hasOwn` does `ToObject` and THROWS on `null`, where the
    // `params?.[…]` it replaced was nullish-safe — and (b) the own-property rule
    // now holds for ANY prototype, not only `Object.prototype`'s members, which
    // is a wider contract than the table above states.
    const { getRoutesApi } = await import("@real-router/core/api");

    const nullBag = createRouter([
      { name: "a", path: "/a/:id" },
      { name: "home", path: "/home" },
    ]);

    getRoutesApi(nullBag).update("a", {
      encodeParams: () => ({ params: null, search: {} }),
    } as never);

    // (a) the NAMED refusal, not `TypeError: Cannot convert … to object`
    expect(() => nullBag.buildPath("a", { id: "7" })).toThrow(
      "Missing required param 'id'",
    );

    nullBag.dispose();

    const inherited = createRouter([
      { name: "a", path: "/a/:id" },
      { name: "home", path: "/home" },
    ]);

    getRoutesApi(inherited).update("a", {
      encodeParams: () => ({
        params: Object.create({ id: "FROM_PROTOTYPE" }) as never,
        search: {},
      }),
    });

    // (b) an ordinary user prototype is refused exactly like an inherited
    // `Object.prototype` member — the codec used to print `/a/FROM_PROTOTYPE`.
    expect(() => inherited.buildPath("a", { id: "7" })).toThrow(
      "Missing required param 'id'",
    );

    inherited.dispose();

    // (c) the QUERY half of the same seam, which the claim above covers and no
    // cell reached. It fails DIFFERENTLY from the path half, and that asymmetry
    // is the reason to pin it: a path slot refuses LOUDLY (the named throw
    // above), while a declared query name is simply not printed. A codec
    // returning a class instance or a reactive DTO — `search: new Dto(search)` —
    // is a plausible shape, and there the key leaves without a word.
    const inheritedSearch = createRouter([
      { name: "a", path: "/a/:id?page" },
      { name: "home", path: "/home" },
    ]);

    getRoutesApi(inheritedSearch).update("a", {
      encodeParams: () => ({
        params: { id: "7" },
        search: Object.create({ page: "FROM_PROTOTYPE" }) as never,
      }),
    });

    expect(inheritedSearch.buildPath("a", { id: "7" }, { page: "2" })).toBe(
      "/a/7",
    );

    inheritedSearch.dispose();

    // (d) the `undefined` term of the three-term guard, which this file's own
    // docblock calls load-bearing while pinning only the `null` half. Reaching
    // it needs the seam too — the facade's `normalizeParams` never yields
    // `undefined` either.
    const undefinedBag = createRouter([
      { name: "a", path: "/a/:id" },
      { name: "home", path: "/home" },
    ]);

    getRoutesApi(undefinedBag).update("a", {
      encodeParams: () => ({ params: undefined, search: {} }),
    } as never);

    expect(() => undefinedBag.buildPath("a", { id: "7" })).toThrow(
      "Missing required param 'id'",
    );

    undefinedBag.dispose();
  });

  it("CONTROL — the bag reaching this read really does inherit Object.prototype", () => {
    // ⚑ Without this, every empty-bag cell above is one refactor from vacuous.
    // They discriminate `Object.hasOwn` from `in` / `params?.[name]` ONLY because
    // the bag the facade hands the matcher is a plain `{}`. Core's own documented
    // perf idiom for hot dictionaries is `Object.create(null)` (15+ sites), and if
    // `EMPTY_PARAMS` or `normalizeParams`' accumulator ever adopted it, a
    // null-prototype bag would answer `in` and `Object.hasOwn` identically —
    // reverting the fix would leave 54 of the 55 cells GREEN. ⚠ Not all 55: the
    // codec-seam BOUNDARY cell supplies its own `Object.create({ id })`, so it
    // reds whatever `EMPTY_PARAMS` is made of — which is precisely why that cell
    // exists and why this one does not stand alone.
    const router = createRouter([
      { name: "empty", path: "/empty" },
      { name: "filled", path: "/filled/:id" },
      { name: "home", path: "/home" },
    ]);

    // `state.params` is the very bag the build direction reads: the shared
    // `EMPTY_PARAMS` singleton for an empty navigation, a fresh accumulator
    // otherwise. Both must inherit `Object.prototype`, observed through the
    // public surface rather than by importing the constants.
    expect({
      empty: Object.getPrototypeOf(
        getPluginApi(router).makeState("empty").params,
      ),
      filled: Object.getPrototypeOf(
        getPluginApi(router).makeState("filled", { id: "1" }).params,
      ),
    }).toStrictEqual({ empty: Object.prototype, filled: Object.prototype });

    router.dispose();
  });

  it("CONTROL — the URL PARSE direction stays intact for every inherited name", () => {
    // The opposite direction was hardened by #855 (`assignParam`) and #1293
    // (`#mergeQueryParams`) and must not regress: a name that genuinely appears
    // in the URL still parses into a real OWN entry, and the bag's prototype is
    // untouched. Without this column a fix could "pass" by refusing the whole
    // key set in both directions.
    //
    // ⚑ REWRITTEN on the rebase onto #1792, and rewritten rather than relaxed.
    // The cell used to expect all TWELVE, and that expectation was the
    // pre-#1792 contract: #855 and #1293 hardened the parse so `__proto__`
    // became a real own entry, and #1792 then NARROWED that on purpose — its
    // guarantee is that the key cannot appear among the own keys of
    // `state.search`, whichever direction produced it. Deleting the cell would
    // have thrown away the anti-overfit column with it; expecting eleven and
    // saying nothing about the twelfth would have hidden which contract moved.
    //
    // So the exclusion is asserted SEPARATELY and by name below. The eleven pin
    // "a fix must not refuse the whole set"; the twelfth pins "and the one
    // exclusion is #1792's, not this branch's" — see
    // `tests/functional/state/proto-key-guarantee.test.ts`, which owns it.
    const router = createRouter([{ name: "a", path: "/a" }], {
      queryParamsMode: "loose",
    });

    const query = INHERITED.map((name) => `${name}=v`).join("&");
    const matched = getPluginApi(router).matchPath(`/a?${query}`);
    const byName = (a: string, b: string): number => a.localeCompare(b);

    expect({
      ownKeys: Object.keys(matched?.search ?? {}).toSorted(byName),
      protoIntact:
        Object.getPrototypeOf(matched?.search ?? {}) === Object.prototype,
    }).toStrictEqual({
      ownKeys: INHERITED.filter((name) => name !== "__proto__").toSorted(
        byName,
      ),
      protoIntact: true,
    });

    // The twelfth, stated rather than subtracted: it is excluded, and the URL
    // carrying it still parses — a refusal of the whole bag would fail here even
    // though the list above no longer names it.
    const one = getPluginApi(router).matchPath("/a?__proto__=v&keep=y");

    expect({
      name: one?.name,
      ownKeys: Object.keys(one?.search ?? {}),
      protoIntact:
        Object.getPrototypeOf(one?.search ?? {}) === Object.prototype,
    }).toStrictEqual({
      name: "a",
      ownKeys: ["keep"],
      protoIntact: true,
    });

    router.dispose();
  });

  it("CONTROL — the table is non-empty and the derivation still finds the whole set", () => {
    // ⚑ Non-vacuity FIRST, and it lives OUTSIDE `describe.each`: an empty list
    // registers ZERO cells in silence, so a broken derivation would leave this
    // file green with nothing in it. A count is what discriminates there, not a
    // colour — and because `INHERITED` is derived at runtime, the count also
    // guards the derivation itself.
    expect(INHERITED).toContain("__proto__");
    expect(INHERITED).toContain("toString");
    expect(INHERITED.length).toBeGreaterThanOrEqual(12);
    expect(NAMES).toContain(ORDINARY);
    // ⚑ NAMES drives `describe.each`, so an empty one registers ZERO describes in
    // silence. It was counted only TRANSITIVELY — through `INHERITED.length`
    // above — and `table-vacuity-authority` flagged that on its first real
    // encounter. A direct count also pins the relationship between the two lists.
    expect(NAMES).toHaveLength(INHERITED.length + 1);

    // ⚑ `FILLABLE` gets its own count, and that is measured rather than
    // inferred: it is derived by a `filter`, so emptying it takes the file from
    // 55 cells to 31 with RC=0 — the two filled columns vanish in silence and
    // every remaining absence-assertion still passes. A count on `INHERITED`
    // alone does not reach it.
    expect(FILLABLE).toHaveLength(NAMES.length - 1);
    expect(FILLABLE).not.toContain("__proto__");

    // ⚑ And the ordinary column must actually BE ordinary. Pointing `ORDINARY`
    // at an inherited member leaves all 55 cells green — the control silently
    // stops discriminating, because a fixed router treats the two alike. What it
    // exists to prove is that the table did not collapse into "every name is
    // empty / refused", and only a name outside the set can prove that.
    expect(INHERITED).not.toContain(ORDINARY);

    // `__proto__` is the only ACCESSOR in the set, which is why the WRITE half of
    // this class (#1792 / #1808 / #1809) singles it out while this READ half does
    // not care: an inherited DATA member is just as readable as an accessor.
    const accessors = INHERITED.filter(
      (name) => Object.getOwnPropertyDescriptor(Object.prototype, name)?.get,
    );

    expect(accessors).toStrictEqual(["__proto__"]);
  });
});
