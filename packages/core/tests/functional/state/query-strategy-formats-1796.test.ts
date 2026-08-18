import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { searchParamsStrategyLists } from "./strategy-lists.js";

import type { SearchParams } from "@real-router/core/types";

/**
 * An invalid `queryParams` format must fail with its NAMED error in BOTH
 * directions — and a prototype member's name is an invalid format like any other
 * (#1796).
 *
 * `requireStrategy` (`engine/search-params/strategies/index.ts`) tested for a
 * missing strategy with `strategy === undefined`, after the caller had already
 * indexed a plain object literal. For the twelve inherited names that lookup
 * returns a MEMBER instead of `undefined`, so the guard passed and that member
 * was installed as the live strategy — the exact deferred `TypeError` #1318 added
 * this guard to prevent, now reached through the one value class its predicate
 * cannot see. (Eleven of the twelve are functions; `__proto__` yields
 * `Object.prototype` itself, which fails the same way one step later, since that
 * object carries no `encode` / `encodeArray`.)
 *
 * Measured before the fix, one probe per cell, each format exercised with a value
 * of its OWN type:
 *
 *     BUILD   array / boolean / null  → TypeError: opts.strategies.X.Y is not a function
 *             number                  → BUILT "/x?a=7" — accepted, and its own
 *                                       matchPath then failed to reproduce it
 *     PARSE   array / null            → resolved, silently CORRECT
 *             boolean / number        → @@router/UNKNOWN_ROUTE, no diagnostic
 *             a plain typo            → @@router/UNKNOWN_ROUTE, no diagnostic
 *
 * That last row is #1318's own reported symptom — *"Every URL with a query
 * resolves to UNKNOWN_ROUTE; the symptom points at routes/URLs, not the config"*
 * — surviving its fix, because the named `TypeError` only ever reached the BUILD
 * direction: on the match path the `#737` catch-all in `SegmentMatcher` swallowed
 * it. So the fix has two halves, and the table below is what proves they are both
 * present: the containers can no longer answer with an inherited member, and a
 * config error is no longer mistaken for malformed input.
 *
 * ⚠ Each format needs a value of its own TYPE. A probe that supplies only an
 * array cannot see three of the four holes — the boolean / null / number
 * strategies are never invoked, and the misconfiguration reads as silent. That is
 * why every cell here carries its own URL and its own build value.
 */
describe("an invalid queryParams format fails with its named error (#1796)", () => {
  interface FormatCase {
    readonly field: string;
    readonly valid: string;
    /** A URL whose value actually exercises this format's strategy. */
    readonly url: string;
    readonly buildValue: unknown;
    readonly parsed: unknown;
  }

  const FORMATS: readonly FormatCase[] = [
    {
      field: "arrayFormat",
      valid: "none",
      url: "/x?a=1&a=2",
      buildValue: ["1", "2"],
      parsed: [1, 2],
    },
    {
      field: "booleanFormat",
      valid: "auto",
      url: "/x?a=true",
      buildValue: true,
      parsed: true,
    },
    {
      field: "nullFormat",
      valid: "default",
      url: "/x?a",
      buildValue: null,
      parsed: null,
    },
    {
      field: "numberFormat",
      valid: "auto",
      url: "/x?a=7",
      buildValue: 7,
      parsed: 7,
    },
  ];

  /**
   * `bogusTypo` is the CONTROL of the invalid column: it is the value class
   * #1318 already covered, so it must keep answering exactly as the prototype
   * names do. If a fix made only the prototype names named, this cell would not
   * notice — which is why it sits in the same list rather than in a cell of its
   * own.
   */
  const INVALID = [
    "bogusTypo",
    "toString",
    "constructor",
    "valueOf",
    "__proto__",
  ];

  /** Bag shapes the snapshot must honour. Counted by the CONTROL cell below. */
  const BAG_SHAPES: readonly (readonly [string, () => object])[] = [
    [
      "own enumerable (the ordinary form)",
      (): object => ({ arrayFormat: "brackets" }),
    ],
    // ⚑ Both of these were DROPPED by a `{ ...queryParams }` snapshot, which copies
    // own enumerable keys only — the router fell back to the default format with
    // nothing said, while `getOptions()` still echoed what the caller set. A plain
    // `opts.arrayFormat` walks the prototype chain, so layering one config over
    // another worked before the snapshot existed; the snapshot reads by NAME to
    // keep that. Pinned as behaviour because the type-mirror table binds the key
    // LIST, not the lookup that reads it.
    [
      "inherited through the prototype",
      (): object => Object.create({ arrayFormat: "brackets" }) as object,
    ],
    [
      "own but non-enumerable",
      (): object =>
        Object.defineProperty({}, "arrayFormat", {
          value: "brackets",
          enumerable: false,
        }),
    ],
  ];

  /** Non-object containers bare core must tolerate. Counted by the CONTROL cell below. */
  const CONTAINERS: readonly (readonly [string, unknown])[] = [
    ["undefined", undefined],
    ["null", null],
    ["a string", "nope"],
    ["a number", 7],
  ];

  const routerWith = (
    field: string,
    value: string,
  ): ReturnType<typeof createRouter> =>
    createRouter(
      [
        { name: "x", path: "/x?a" },
        { name: "home", path: "/home" },
      ],
      { queryParams: { [field]: value } },
    );

  /**
   * Reports WHAT happened rather than a boolean, so a cell that silently
   * succeeds names the value it produced instead of failing as a bare `false`.
   */
  const outcomeOf = async (
    field: string,
    attempt: () => Promise<string> | string,
  ): Promise<string> => {
    try {
      return `accepted: ${await attempt()}`;
    } catch (error) {
      return (error as Error).message.includes(
        `[search-params] Unknown ${field}`,
      )
        ? "named"
        : `wrong error: ${(error as Error).message}`;
    }
  };

  describe.each(FORMATS)("$field", (format) => {
    it.each(INVALID)(
      "%s is refused BY NAME at construction, before either direction runs",
      (value) => {
        // ⚑ The refusal moved, and moving it is the fix's second half.
        //
        // `resolveStrategies` used to run per parse and per build, so the named
        // TypeError arrived from INSIDE `matchPath` — the parse path, where the
        // `#737` catch swallowed it into `UNKNOWN_ROUTE` (#1318's own reported
        // symptom, surviving its fix) and where the URL plugins call from
        // popstate and `navigate`-event handlers that have nobody to catch for
        // them. `createMatcher` now resolves once, at construction.
        //
        // Three things follow, and each is asserted somewhere in this file:
        // the error names the field; no direction can raise it any more; and the
        // refusal is UNCONDITIONAL — it no longer waits for a URL that happens
        // to carry a query key.
        expect(() => routerWith(format.field, value)).toThrow(
          `[search-params] Unknown ${format.field} "${value}"`,
        );
      },
    );

    it("the refusal does not wait for a query key to appear", () => {
      // Both directions short-circuit on an empty query before resolving, so a
      // router with a bogus format used to run cleanly until the first URL that
      // carried one. `buildPath("x", {}, {})` and `start("/x?")` were both silent.
      expect(() => routerWith(format.field, "bogusTypo")).toThrow(
        `[search-params] Unknown ${format.field} "bogusTypo"`,
      );
    });

    it("a VALID format raises nothing from either direction", async () => {
      // The counterpart of the cell above: with the refusal hoisted, neither
      // `buildPath` nor `matchPath` can raise a CONFIG error at all — which is
      // what removes it from every unguarded `matchPath` call site downstream.
      const router = routerWith(format.field, format.valid);

      await expect(
        outcomeOf(format.field, () =>
          router.buildPath("x", {}, { a: format.buildValue } as SearchParams),
        ),
      ).resolves.toMatch(/^accepted: /u);

      await expect(
        outcomeOf(format.field, async () => {
          await router.start(format.url);

          return String(router.getState()?.name);
        }),
      ).resolves.toBe("accepted: x");

      router.dispose();
    });

    it("VALID — the format still round-trips through its own URL", async () => {
      // The column that stops the table degenerating into "everything throws".
      const router = routerWith(format.field, format.valid);
      const href = router.buildPath("x", {}, {
        a: format.buildValue,
      } as SearchParams);

      await router.start(href);

      expect({
        name: router.getState()?.name,
        a: router.getState()?.search.a,
      }).toStrictEqual({ name: "x", a: format.parsed });

      router.dispose();
    });
  });

  it("CONTROL — the message names the remedy, and the remedy is DERIVED", () => {
    // ⚑ The half of the message nothing used to check. `outcomeOf` asserts only
    // the `Unknown <field>` prefix, so the `— expected …` tail — the part that
    // tells a developer what to write instead — was free to be wrong. Measured on
    // the hand-written form: deleting the tail entirely left all 4393 tests green,
    // and handing `booleanFormat` the `nullFormat` list left them green too. A
    // remedy that points at another option's union is worse than no remedy.
    //
    // The tail is now DERIVED from the very table the lookup failed against, so it
    // cannot name a value the table does not carry — the same shape as #1811's
    // `urlParamsEncoding` message. This cell pins that it is present, per-field,
    // and complete.
    for (const field of Object.keys(searchParamsStrategyLists)) {
      const expected = searchParamsStrategyLists[field];
      let message = "";

      try {
        createRouter([{ name: "x", path: "/x?a" }], {
          queryParams: { [field]: "bogusTypo" },
        });
      } catch (error) {
        message = (error as Error).message;
      }

      // ⚠ The TAIL, exactly — not `toContain` per value. A subset assertion lets
      // the hand list SHRINK and the table GROW without a word, and says nothing
      // about order or separator. Slicing from the marker scopes it away from the
      // `"bogusTypo"` the message already contains, which a per-value `toContain`
      // would happily match against.
      const tail = message.slice(message.indexOf("— expected "));
      const quoted = expected.map((value) => `"${value}"`).join(" | ");

      expect(tail).toBe(`— expected ${quoted}`);
    }
  });

  it("an accessor-backed queryParams is read ONCE, so teardown runs no application code", async () => {
    // Hoisting resolution into `createMatcher` put a read of the caller's
    // `queryParams` on every MATCHER REBUILD — `add` / `remove` / `replace` /
    // `setRootPath`, and `resetStore`, which `dispose()` goes through. That
    // object is supported input and may be accessor-backed, so a getter answering
    // differently on the rebuild threw out of `dispose()` AFTER `sendDispose()`:
    // `isDisposed()` was already true, the idempotency early-return swallowed
    // every retry, and everything below the throw never ran — `markDisposed`, the
    // lifecycle teardown, the dependency reset. What such a router still ANSWERS
    // is `buildPath` / `canNavigateTo` / `has` (measured); `navigate` refuses, but
    // with the wrong reason. Core documents that teardown as holding together
    // "only because no user code runs in them".
    //
    // `deriveMatcherOptions` now SNAPSHOTS the bag, so the getter runs during
    // construction and never again. Counted rather than asserted on the outcome,
    // because the outcome (a clean dispose) is what a still-broken build produces
    // whenever the getter happens to answer consistently.
    let reads = 0;
    const queryParams = {
      get arrayFormat(): string {
        reads += 1;

        return reads > 3 ? "NOPE" : "brackets";
      },
    };

    const router = createRouter(
      [
        { name: "x", path: "/x?a" },
        { name: "home", path: "/home" },
      ],
      { queryParams } as never,
    );

    const afterConstruction = reads;

    getRoutesApi(router).add({ name: "y", path: "/y" });
    await router.start("/home");

    expect(() => {
      router.dispose();
    }).not.toThrow();

    expect({
      readsDuringConstruction: afterConstruction > 0,
      readsAfterConstruction: reads - afterConstruction,
      // the whole teardown ran: a disposed router refuses, it does not answer
      disposed: (() => {
        try {
          getRoutesApi(router).add({ name: "z", path: "/z" });

          return false;
        } catch {
          return true;
        }
      })(),
    }).toStrictEqual({
      readsDuringConstruction: true,
      readsAfterConstruction: 0,
      disposed: true,
    });
  });

  it.each(BAG_SHAPES)(
    "a queryParams format is honoured when it is %s",
    (_label, make) => {
      const router = createRouter(
        [
          { name: "s", path: "/s?tags" },
          { name: "home", path: "/home" },
        ],
        { queryParams: make() },
      );

      try {
        expect(router.buildPath("s", {}, { tags: ["a", "b"] })).toBe(
          "/s?tags[]=a&tags[]=b",
        );
      } finally {
        router.dispose();
      }
    },
  );

  it("CONTROL — the cell above discriminates: no queryParams prints the default form", () => {
    // Without this, all three cells above pass against a router that ignores
    // `queryParams` entirely — `brackets` and the default would be one string.
    const router = createRouter([
      { name: "s", path: "/s?tags" },
      { name: "home", path: "/home" },
    ]);

    try {
      expect(router.buildPath("s", {}, { tags: ["a", "b"] })).toBe(
        "/s?tags=a&tags=b",
      );
    } finally {
      router.dispose();
    }
  });

  it.each(CONTAINERS)(
    "a %s queryParams container is tolerated, not a constructor crash",
    (_label, queryParams) => {
      // `deriveMatcherOptions` asserted this away with a `!` that was FALSE:
      // `createRouter(routes, { queryParams: undefined })` reaches it with nothing.
      // A spread turned that into `{}`; reading a field off it is a `TypeError`
      // thrown from inside the constructor, naming nothing the caller wrote.
      // Rejecting these BY NAME belongs to `@real-router/validation-plugin`, as it
      // does for the three enum options — bare core degrades.
      expect(() => {
        createRouter(
          [
            { name: "s", path: "/s?tags" },
            { name: "home", path: "/home" },
          ],
          { queryParams } as never,
        ).dispose();
      }).not.toThrow();
    },
  );

  it("the snapshot reads each format field exactly ONCE", () => {
    // ⚑ Counted, because the OUTCOME cannot tell one read from two: a getter that
    // answers consistently produces the same router either way, which is how the
    // first version of this snapshot shipped reading every field TWICE. The
    // conditional spread it used —
    // `...(qp.x !== undefined && { x: qp.x })` — evaluates `qp.x` in the test and
    // again in the value, i.e. it MOVED the `makeOptions` TOCTOU here instead of
    // collapsing it, and the router ran on the second value while the test that
    // admitted it saw the first.
    //
    // ⚠ The threshold is 1 read BY THE SNAPSHOT, not 1 in the process: the options
    // deep-freeze walks the same object first, so the total at construction is 2.
    // Asserted as a total with that split named, so a change to either reader is
    // visible rather than absorbed.
    const reads: string[] = [];
    const queryParams = {
      get arrayFormat(): string {
        reads.push(
          (new Error("stack probe").stack ?? "").includes("snapshotQueryParams")
            ? "snapshot"
            : "other",
        );

        return "brackets";
      },
    };

    const router = createRouter(
      [
        { name: "s", path: "/s?tags" },
        { name: "home", path: "/home" },
      ],
      { queryParams } as never,
    );

    try {
      expect({
        bySnapshot: reads.filter((who) => who === "snapshot").length,
        total: reads.length,
      }).toStrictEqual({ bySnapshot: 1, total: 2 });
    } finally {
      router.dispose();
    }
  });

  it("BOUNDARY — getOptions() still hands back the caller's OBJECT, not the snapshot", () => {
    // A divergence the snapshot INTRODUCES, pinned rather than papered over — the
    // twin of the `urlParamsEncoding` echo in url-params-encoding-1811.test.ts.
    // `getOptions()` reports the router's raw options while the matcher runs on a
    // copy taken at construction, so for an accessor-backed bag a plugin reading
    // `getOptions().queryParams.arrayFormat` can see a value the matcher is not
    // using. That is strictly better than the alternative it replaced (the matcher
    // re-reading the getter mid-teardown), and the only configs that can reach the
    // disagreement are ones a getter deliberately varies.
    //
    // ⚑ Pinned because the tempting "fix" is to hand back the snapshot from
    // `getOptions()` too, which would put the same copy in two places — the second
    // source of truth this class of bug is made of.
    const bag = { arrayFormat: "brackets" };
    const router = createRouter(
      [
        { name: "s", path: "/s?tags" },
        { name: "home", path: "/home" },
      ],
      { queryParams: bag } as never,
    );

    try {
      expect(getPluginApi(router).getOptions().queryParams).toBe(bag);
    } finally {
      router.dispose();
    }
  });

  it("CONTROL — malformed percent-encoding still UNMATCHES rather than throwing", async () => {
    // The #737 hardening the narrowed catch must not retire, and the reason the
    // catch cannot simply be deleted. `match()` must never throw on INPUT: an
    // invalid UTF-8 percent sequence makes the query parser raise a `URIError`,
    // and the router must resolve to UNKNOWN_ROUTE instead of crashing `start()`.
    // Only a CONFIG error — a `TypeError` naming a `queryParams` field — is
    // allowed through.
    const router = createRouter(
      [
        { name: "x", path: "/x?a" },
        { name: "home", path: "/home" },
      ],
      { allowNotFound: true },
    );

    await expect(router.start("/x?a=%E0%41")).resolves.toBeDefined();

    expect(router.getState()?.name).toBe("@@router/UNKNOWN_ROUTE");

    router.dispose();
  });

  it("the guard indexes by the KEY it tested, so a drifting format cannot be admitted as one strategy and used as another", () => {
    // ⚑ The twin of the encoder door's cell in `url-params-encoding-1811`, and
    // the reason both exist: owning the LOOKUP (this file's whole subject) is
    // only half of owning the decision. `Object.hasOwn(table, value)` and the
    // `table[value]` below it each run `ToPropertyKey`, so passing the caller's
    // VALUE through both reads a caller-owned object twice — and `queryParams`
    // is caller-owned, so the two reads may answer differently.
    //
    // Measured before the key was hoisted: a `{ toString }` answering "none"
    // to the guard and "toString" to the lookup installed `Object.prototype`'s
    // method as the live strategy and deferred
    // `opts.strategies.array.encodeArray is not a function` — verbatim the
    // failure this guard was written to prevent, reached one layer out from
    // the blind spot it closed.
    const drifting = (first: string, then: string): string => {
      let reads = 0;

      return {
        toString: () => (++reads === 1 ? first : then),
      } as unknown as string;
    };

    const build = (value: string): string => {
      const router = routerWith("arrayFormat", value);

      try {
        return router.buildPath("x", {}, { a: ["1", "2"] });
      } finally {
        router.dispose();
      }
    };

    expect({
      // Admitted as "none" — must BE "none" (repeated key), not the member the
      // second read answers.
      admittedValid: build(drifting("none", "toString")),
      admittedValidThenTypo: build(drifting("none", "bogusTypo")),
    }).toStrictEqual({
      admittedValid: "/x?a=1&a=2",
      admittedValidThenTypo: "/x?a=1&a=2",
    });
  });

  it("the #737 catch SWALLOWS a third error class, and rethrows only ours", () => {
    // ⚑ Without this cell the narrowing is pinned by exactly two classes — a
    // `URIError` must unmatch, a `TypeError` must propagate — and ANY predicate
    // separating those two passes, INCLUDING its own complement. Measured:
    // `error instanceof URIError` swapped for `!(error instanceof TypeError)`
    // left all 4415 tests green. Two points do not determine a line.
    //
    // ⚠ The third class is REACHABLE, which corrects the changeset's safety
    // argument. `assignParam` writes `params[name] = value` for every key except
    // `__proto__`, and the key is chosen by the URL — so on a polluted
    // `Object.prototype` the write dispatches into an application setter, inside
    // the very `try` this narrowing guards. That thrower is neither
    // `decodeURIComponent` nor `requireStrategy`.
    //
    // ⚠ An earlier revision of this cell pinned the OPPOSITE — that the third
    // class propagates, on the reasoning that "an application fault must not be
    // reported as no such route". Reversed, on a measurement that revision did
    // not have: the rethrow is selected by INPUT, and no caller of `matchPath`
    // catches. `browser-plugin/factory.ts:157`, `hash-plugin/plugin.ts:100`,
    // four sites in `navigation-plugin`, `ssr-utils/getStaticPaths`, and
    // `preload-plugin/plugin.ts:299` — the last from a `mouseover` listener on
    // `document`, where one hover raised an uncaught `error` on `window`. Per
    // #1819's own note an un-intercepted navigate event makes Chromium perform a
    // full-document reload. "`match()` never throws on input" outranks
    // "attribute the fault", because the caller that would attribute it is a
    // popstate handler.
    //
    // So the catch is fail-SAFE again — but not fail-open-again: what #1796
    // refused to swallow still escapes, by ORIGIN rather than by class. The
    // config fault carries a marker (`CONFIG_FAULT`, set where it is raised),
    // and the CONTROL below is what keeps this cell from collapsing back into
    // "the catch swallows everything".
    //
    // ⚠ Cost of the alternative, measured and rejected: making `assignParam`
    // define unconditionally removes the dispatch at the source and lets this
    // URL match correctly rather than merely not throw — but it costs **+25 % on
    // `matchPath`** (1400 → 1750 ns at three query keys), on the path every
    // popstate and every `start()` takes. Recorded here so the cheaper answer is
    // not re-derived as the better one.
    const boom = new RangeError("the application's own setter failed");
    let fired = false;

    Object.defineProperty(Object.prototype, "rrProbeKey", {
      set() {
        fired = true;

        throw boom;
      },
      configurable: true,
    });

    const router = createRouter([{ name: "x", path: "/x?a" }]);

    try {
      // Swallowed: the URL does not match, and nothing escapes into the caller.
      expect(getPluginApi(router).matchPath("/x?rrProbeKey=1")).toBeUndefined();

      // …and the setter really did run, so this is a swallow and not a case of
      // the write never happening. Without it the cell would pass on a build
      // where `assignParam` had stopped assigning.
      expect(fired, "the application setter was reached").toBe(true);

      // CONTROL — the class the catch EXISTS for is still swallowed, so the cell
      // pins a narrowing rather than the absence of a catch.
      expect(getPluginApi(router).matchPath("/x?a=%E0%41")).toBeUndefined();

      // CONTROL — and the config fault still ESCAPES, which is what stops this
      // cell from being satisfied by a catch that swallows everything. Two
      // swallows and one rethrow determine the predicate; two swallows alone do
      // not.
      const misconfigured = createRouter([{ name: "x", path: "/x?a" }], {
        queryParams: { arrayFormat: "bogusTypo" as never },
      });

      try {
        expect(() => getPluginApi(misconfigured).matchPath("/x?a=1")).toThrow(
          /Unknown arrayFormat/,
        );
      } finally {
        misconfigured.dispose();
      }
    } finally {
      Reflect.deleteProperty(Object.prototype, "rrProbeKey");
      router.dispose();
    }
  });

  it("a symbol format is REFUSED BY NAME, not by a raw coercion crash", () => {
    // ⚑ A behaviour change that ships with the key hoist, and the only one.
    // The guard always detected a symbol (`Object.hasOwn` answered `false`), but
    // building its own message then threw `Cannot convert a Symbol value to a
    // string` from the template — so the named `TypeError` this file exists to
    // deliver never reached the caller for that one value class. `String(value)`
    // above the check is legal on a symbol, so the message now arrives.
    const router = routerWith("arrayFormat", Symbol("s") as unknown as string);

    try {
      expect(() => router.buildPath("x", {}, { a: ["1"] })).toThrow(
        '[search-params] Unknown arrayFormat "Symbol(s)"',
      );

      // ⚑ And the REMEDY half, which nothing pinned: `outcomeOf` above matches
      // the message PREFIX only, so replacing the whole `— expected …` tail with
      // a constant survived all 4415 tests. Asserted as a SET rather than a
      // literal, deliberately — #1819 derives this list from the table, where
      // the order follows the declaration (`{ auto, none }`) and not the
      // hand-written text, so a literal here would red on a change that is
      // correct.
      const message = (() => {
        try {
          router.buildPath("x", {}, { a: ["1"] });
        } catch (error) {
          return (error as Error).message;
        }

        return "";
      })();

      // ⚑ Compared as ONE object, not walked in a `for` loop. The loop form was
      // written first and reverted: emptying its list made the assertions vanish
      // in SILENCE — measured, 52 cells still green — and
      // `table-vacuity-authority` cannot catch it, because that scanner walks
      // `it.each` / `describe.each` arguments and a bare `for…of` is invisible to
      // it. Here an empty list produces `{}` against a four-key expectation and
      // reds, so the shape cannot go vacuous.
      //
      // ⚠ Hand-written for the same reason `VALID` is in the #1811 sibling: a
      // functional test may not import an internal `src/*` path, and a fifth
      // arrayFormat added to `arrayStrategies` arrives as an uncovered branch,
      // which this package's 100% gate already refuses.
      const REMEDY = ["none", "brackets", "index", "comma"];

      expect(
        Object.fromEntries(
          REMEDY.map((name) => [name, message.includes(`"${name}"`)]),
        ),
      ).toStrictEqual({
        none: true,
        brackets: true,
        index: true,
        comma: true,
      });
    } finally {
      router.dispose();
    }
  });

  it("CONTROL — the table is non-empty and both of its axes are populated", () => {
    // ⚑ Non-vacuity, OUTSIDE `describe.each`: an empty list registers ZERO cells
    // in silence, so a broken derivation would leave this file green with
    // nothing in it. A count is what discriminates there, not a colour.
    expect(FORMATS).toHaveLength(4);
    expect(INVALID.length).toBeGreaterThanOrEqual(5);

    // The invalid column must contain BOTH classes, or the table stops proving
    // that the fix covers the one #1318 missed.
    expect(INVALID).toContain("bogusTypo");
    expect(INVALID).toContain("toString");

    // ⚑ `searchParamsStrategyLists` indexes the remedy cell's only loop, so an
    // empty record runs ZERO assertions there and the cell passes green — the
    // same failure this file already guards for `FORMATS` and `INVALID`, and the
    // one the sibling `options.test.ts` was restructured to avoid. It gets its
    // OWN threshold, cross-checked against `FORMATS` so the two cannot drift.
    const byName = (a: string, b: string): number => a.localeCompare(b);

    expect(
      Object.keys(searchParamsStrategyLists).toSorted(byName),
    ).toStrictEqual(FORMATS.map((format) => format.field).toSorted(byName));

    // ⚑ And the two lists this file grew for the snapshot, for the SAME reason —
    // measured: emptying either takes the file from 47 cells to 44 resp. 43 with
    // RC=0, i.e. they vanish exactly as silently as the ones above. One threshold
    // per list, because a count on one does not reach the other.
    expect(BAG_SHAPES).toHaveLength(3);
    expect(CONTAINERS).toHaveLength(4);

    for (const values of Object.values(searchParamsStrategyLists)) {
      expect(values.length).toBeGreaterThanOrEqual(2);
    }

    // And each format must be exercised with a value of its own type — the
    // warning at the top, made checkable.
    expect(
      FORMATS.map((f) => typeof f.buildValue).toSorted((a, b) =>
        a.localeCompare(b),
      ),
    ).toStrictEqual(["boolean", "number", "object", "object"]);
  });

  it("CONTROL — a valid config resolves with no params bag at all", () => {
    // Pins the fast path `makeOptions` takes when no format is customised: the
    // cached DEFAULT_OPTIONS must not be reachable from any of the cells above.
    const router = createRouter([{ name: "x", path: "/x?a" }]);

    expect(router.buildPath("x", {}, { a: 7 })).toBe("/x?a=7");

    router.dispose();
  });
});
