import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

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
    // the hand-written form: deleting the tail entirely left the whole suite green,
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
    // re-reading the getter mid-teardown).
    //
    // ⚠ An earlier revision added "and the only configs that can reach the
    // disagreement are ones a getter deliberately varies". That is false, and
    // measurably so: `OptionsNamespace`'s deep-freeze recurses only when
    // `value.constructor === Object`, so an `Object.create(null)` bag or a class
    // instance is never frozen — a plain WRITE to one reaches the divergence
    // with no accessor anywhere. What the snapshot changes is which side wins:
    // before, the late write took effect on the matcher; now the matcher keeps
    // the construction-time value and only `getOptions()` echoes the write.
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

    // ⚑ Refused at CONSTRUCTION since the strategies are resolved there, so the
    // drift is caught before any URL exists. That is a stronger statement than
    // the one this cell was written for — it used to build a path and check the
    // href — and it is the same property: the value admitted by the guard is the
    // value used by the lookup, so a `toString` that changes its answer cannot
    // slip a second reading past the first.
    const build = (value: string): string => {
      const router = routerWith("arrayFormat", value);

      try {
        return router.buildPath("x", {}, { a: ["1", "2"] });
      } finally {
        router.dispose();
      }
    };

    const outcome = (value: string): string => {
      try {
        return build(value);
      } catch (error) {
        return `THREW ${(error as Error).message.slice(0, 34)}`;
      }
    };

    expect({
      // Admitted as "none" — must BE "none" (repeated key), not the member the
      // second read answers.
      admittedValid: outcome(drifting("none", "toString")),
      admittedValidThenTypo: outcome(drifting("none", "bogusTypo")),
      // CONTROL — a stable valid value is untouched, so the cell pins the drift
      // and not "an object value is refused".
      stableValid: outcome("none"),
    }).toStrictEqual({
      admittedValid: "/x?a=1&a=2",
      admittedValidThenTypo: "/x?a=1&a=2",
      stableValid: "/x?a=1&a=2",
    });
  });

  it("the #737 catch SWALLOWS a third error class, and rethrows only ours", () => {
    // ⚑ Without this cell the narrowing is pinned by exactly two classes — a
    // `URIError` must unmatch, a `TypeError` must propagate — and ANY predicate
    // separating those two passes, INCLUDING its own complement. Measured:
    // `error instanceof URIError` swapped for `!(error instanceof TypeError)`
    // left the whole suite green. Two points do not determine a line.
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
      // ⚑ At CONSTRUCTION, since the strategies resolve there — the hoist's
      // point, and it makes this control stronger than it was: the fault cannot
      // reach `matchPath` at all, so the parse could not report a config error
      // as `UNKNOWN_ROUTE` even with the marker arm removed. The arm still
      // guards the engine-layer seam, pinned directly in
      // `tests/engine/unit/path-matcher/SegmentMatcher.test.ts`.
      expect(() =>
        createRouter([{ name: "x", path: "/x?a" }], {
          queryParams: { arrayFormat: "bogusTypo" as never },
        }),
      ).toThrow(/Unknown arrayFormat/);
    } finally {
      Reflect.deleteProperty(Object.prototype, "rrProbeKey");
      router.dispose();
    }
  });

  it("a format whose coercion THROWS is reported as a fault about ITS OWN field", () => {
    // The snapshot moved `String(value)` — i.e. the CALLER's `toString` — into
    // `createRouter`. Uncaught, an application's own exception then leaves the
    // constructor naming no option at all, which is strictly less useful than
    // the named refusal beside it and is the shape `options.test.ts` pins the
    // opposite of for the sibling `defaultRoute` slot.
    const bomb = {
      toString() {
        throw new Error("app toString bomb");
      },
    };

    let caught: unknown;

    try {
      createRouter([{ name: "s", path: "/s?tags" }], {
        queryParams: { booleanFormat: bomb },
      } as never);
    } catch (error) {
      caught = error;
    }

    expect({
      type: (caught as Error | undefined)?.constructor.name,
      message: (caught as Error | undefined)?.message,
      // The app's own error is not REPLACED, it rides along — losing it would
      // trade one unhelpful diagnostic for another.
      cause: ((caught as Error | undefined)?.cause as Error | undefined)
        ?.message,
    }).toStrictEqual({
      type: "TypeError",
      message:
        "[search-params] Could not read booleanFormat — its `toString` threw.",
      cause: "app toString bomb",
    });

    // CONTROL — a `toString` that ANSWERS is still honoured, so the catch did not
    // turn every object-valued slot into a refusal.
    const router = createRouter([{ name: "s", path: "/s?tags" }], {
      queryParams: { arrayFormat: { toString: () => "brackets" } },
    } as never);

    try {
      expect(router.buildPath("s", {}, { tags: ["a", "b"] })).toBe(
        "/s?tags[]=a&tags[]=b",
      );
    } finally {
      router.dispose();
    }
  });

  it("the stored matcher options are frozen — container, snapshot, and the empty singleton", () => {
    // ⚑ Three freezes, none of which had a test: mutation showed that removing
    // any one of them left all 4462 cells green. They matter for different
    // reasons, so all three are asserted here rather than one standing in for
    // the others.
    const stored = (queryParams: unknown) => {
      const router = createRouter([{ name: "s", path: "/s?tags" }], {
        queryParams,
      } as never);

      // `@real-router/core/validation` is a PUBLISHED subpath, which is what
      // makes these objects reachable at all — the freezes are not internal
      // hygiene.
      return {
        router,
        options: (
          getInternals(router) as unknown as {
            routeGetStore: () => { matcherOptions: { queryParams: object } };
          }
        ).routeGetStore().matcherOptions,
      };
    };

    const custom = stored({ arrayFormat: "brackets" });
    const empty = stored(undefined);
    const secondEmpty = stored(undefined);

    try {
      expect({
        // The CONTAINER: freezing only the snapshot stops a write INTO it and
        // nothing about REPLACING the slot — measured, a swap here made `add`,
        // `setRootPath` and `dispose()` throw, restoring the defect verbatim.
        container: Object.isFrozen(custom.options),
        // The SNAPSHOT: `defineProperty` could otherwise re-install an accessor
        // in the very slot the snapshot exists to empty.
        snapshot: Object.isFrozen(custom.options.queryParams),
        // The EMPTY singleton is the strongest of the three, because it is a
        // module-level object SHARED by every router that passes no bag — the
        // #897 class. Poisoning it through one router changed a later, unrelated
        // router's output.
        emptyIsShared:
          empty.options.queryParams === secondEmpty.options.queryParams,
        emptyIsFrozen: Object.isFrozen(empty.options.queryParams),
      }).toStrictEqual({
        container: true,
        snapshot: true,
        emptyIsShared: true,
        emptyIsFrozen: true,
      });

      // …and the freezes BITE, rather than merely being reported. `isFrozen` on
      // its own would pass against a `Proxy` that lies about it.
      expect(() =>
        Object.defineProperty(custom.options.queryParams, "arrayFormat", {
          get: () => "comma",
        }),
      ).toThrow(TypeError);

      expect(() => {
        (custom.options as { queryParams: unknown }).queryParams = {};
      }).toThrow(TypeError);
    } finally {
      custom.router.dispose();
      empty.router.dispose();
      secondEmpty.router.dispose();
    }
  });

  it("a NON-DEFAULT value of every format actually TAKES EFFECT", () => {
    // ⚑ This cell exists because the file did not have it, and the gap was
    // total: a mutant that let invalid values through (so every refusal cell
    // stayed green) while silently DROPPING a valid `booleanFormat` /
    // `nullFormat` / `numberFormat` left the whole suite — 4462 tests — green.
    //
    // The cause is a vacuity mode worth naming: every `FORMATS[i].valid` was
    // that field's OWN DEFAULT (`auto` / `default` / `auto`, byte-identical to
    // `DEFAULT_QUERY_PARAMS`), so eight cells asserting "a VALID format raises
    // nothing" and "it round-trips through its own URL" could not tell HONOURED
    // from IGNORED. Only `arrayFormat` had a non-default pin, via `BAG_SHAPES`.
    //
    // So each value below differs from its default, and the assertion is on the
    // OBSERVABLE difference rather than on the absence of a throw. Both
    // directions, because the four formats do not all show up in one of them.
    const observe = (queryParams: unknown, url: string, bag: unknown) => {
      const router = createRouter([{ name: "s", path: "/s?a" }], {
        queryParams,
      } as never);

      try {
        return {
          match: getPluginApi(router).matchPath(url)?.search,
          build: router.buildPath("s", {}, bag as never),
        };
      } finally {
        router.dispose();
      }
    };

    expect({
      boolean: observe({ booleanFormat: "none" }, "/s?a=true", { a: true }),
      null: observe({ nullFormat: "hidden" }, "/s?a", { a: null }),
      number: observe({ numberFormat: "none" }, "/s?a=5", { a: 5 }),
      array: observe({ arrayFormat: "brackets" }, "/s?a=1", { a: ["x", "y"] }),
    }).toStrictEqual({
      // decode: "true" stays a string instead of becoming a boolean
      boolean: { match: { a: "true" }, build: "/s?a=true" },
      // build: the bare key is omitted instead of printed
      null: { match: { a: null }, build: "/s" },
      // decode: "5" stays a string instead of becoming a number
      number: { match: { a: "5" }, build: "/s?a=5" },
      // build: the repeat form gains brackets. ⚠ `match` is `1` and not `"1"`
      // because `numberFormat` is still its default `auto` — arrayFormat does
      // not govern a single scalar's coercion, and writing `"1"` here made the
      // cell red, which is the cell doing its job on its own author.
      array: { match: { a: 1 }, build: "/s?a[]=x&a[]=y" },
    });

    // CONTROL — the same four reads under the DEFAULTS. Without it the block
    // above would also pass against a router that ignores `queryParams`
    // entirely and happens to default to these answers.
    expect({
      boolean: observe(undefined, "/s?a=true", { a: true }),
      null: observe(undefined, "/s?a", { a: null }),
      number: observe(undefined, "/s?a=5", { a: 5 }),
      array: observe(undefined, "/s?a=1", { a: ["x", "y"] }),
    }).toStrictEqual({
      boolean: { match: { a: true }, build: "/s?a=true" },
      null: { match: { a: null }, build: "/s?a" },
      number: { match: { a: 5 }, build: "/s?a=5" },
      array: { match: { a: 1 }, build: "/s?a=x&a=y" },
    });
  });

  it('a NULLISH format slot is absence, not the string "null"', () => {
    // ⚑ A regression this branch shipped and the swarm caught: `asKey` guarded
    // `undefined` only, so `null` reached `String(null)` and became the key
    // `"null"` — and `makeOptions`' `?? DEFAULT` can never rescue that, because
    // it is handed a non-nullish value. `createRouter` then refused a config the
    // base accepted.
    //
    // ⚠ `null` is the REACHABLE half of nullish, not the exotic one: `JSON.parse`
    // and YAML produce `null` and never `undefined`, and `cfg.x ?? null` is an
    // ordinary spelling. Four changeset / docblock sentences said this class
    // "stays outside the guard"; it did not.
    const build = (queryParams: unknown): string => {
      const router = createRouter([{ name: "s", path: "/s?tags" }], {
        queryParams,
      } as never);

      try {
        return router.buildPath("s", {}, { tags: ["a", "b"] });
      } finally {
        router.dispose();
      }
    };

    expect({
      // All four slots, because the coercion is per-slot.
      arrayNull: build({ arrayFormat: null }),
      booleanNull: build({ booleanFormat: null }),
      nullNull: build({ nullFormat: null }),
      numberNull: build({ numberFormat: null }),
      // CONTROL — `undefined` behaved correctly all along, so the cell must not
      // pass merely because nullish is handled at all.
      undefinedSlot: build({ arrayFormat: undefined }),
      // CONTROL — a real value still takes effect, so the fix is not "ignore the
      // slot".
      realValue: build({ arrayFormat: "brackets" }),
    }).toStrictEqual({
      arrayNull: "/s?tags=a&tags=b",
      booleanNull: "/s?tags=a&tags=b",
      nullNull: "/s?tags=a&tags=b",
      numberNull: "/s?tags=a&tags=b",
      undefinedSlot: "/s?tags=a&tags=b",
      realValue: "/s?tags[]=a&tags[]=b",
    });

    // …and an INVALID string is still refused by name, so restoring nullish did
    // not widen the gate.
    expect(() => build({ arrayFormat: "bogusTypo" })).toThrow(
      /Unknown arrayFormat "bogusTypo"/,
    );
  });

  it("ATTACK — the marker check cannot itself throw, and a primitive throw is safe", () => {
    // ⚑ Found by attacking this branch's own fix, not by review. The narrowing
    // rethrows what carries a marker — and asking `SYMBOL in error` runs the
    // `has` trap of a Proxy, so the ASK could throw out of `matchPath`, which is
    // the exact contract the narrowing exists to protect. One fail-open default
    // was replaced by another wearing a different hat.
    //
    // Three shapes, all thrown from an `Object.prototype` setter keyed by the
    // URL, which is the only channel that reaches the guarded `try` with an
    // application-chosen value.
    const outcome = (key: string, thrown: unknown): string => {
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        // Setter-only on purpose: the write is what the parser performs, and a
        // getter here would only add a second way for the fixture to be wrong.
        set() {
          throw thrown;
        },
      });

      const router = createRouter([{ name: "x", path: "/x?a" }]);

      try {
        return (
          getPluginApi(router).matchPath(`/x?${key}=1`)?.name ?? "unmatched"
        );
      } catch (error) {
        return `THREW ${(error as Error).constructor.name}`;
      } finally {
        Reflect.deleteProperty(Object.prototype, key);
        router.dispose();
      }
    };

    const forged = new Error("forged by the application");

    Object.defineProperty(
      forged,
      Symbol.for("real-router.searchParams.configFault"),
      { value: true },
    );

    expect({
      // A Proxy whose `has` trap throws — the ask itself.
      proxyHasTrap: outcome(
        "atkProxy",
        new Proxy(new Error("boom"), {
          has() {
            throw new RangeError("has trap");
          },
        }),
      ),
      // A primitive — `in` on one is a TypeError, so the typeof gate matters.
      primitive: outcome("atkPrimitive", "a string, not an Error"),
      // CONTROL — the marker is a LABEL, not a capability: `Symbol.for` is a
      // global registry, so an application CAN forge it, and then it is
      // rethrown. Accepted and pinned rather than left to be discovered.
      forgedMarker: outcome("atkForged", forged),
    }).toStrictEqual({
      proxyHasTrap: "unmatched",
      primitive: "unmatched",
      forgedMarker: "THREW Error",
    });
  });

  it("a symbol format is REFUSED BY NAME, not by a raw coercion crash", () => {
    // ⚑ A behaviour change that ships with the key hoist, and the only one. The
    // guard always detected a symbol (`Object.hasOwn` answered `false`), but
    // building its own message then threw `Cannot convert a Symbol value to a
    // string` from the template — so the named `TypeError` this file exists to
    // deliver never reached the caller for that one value class. Coercing above
    // the check is legal on a symbol, so the message now arrives.
    //
    // ⚑ At CONSTRUCTION, since the strategies resolve there: the symbol is
    // coerced once, where the router is built, and the named error arrives
    // before any URL exists. What the cell pins is unchanged.
    const message = (() => {
      try {
        routerWith("arrayFormat", Symbol("s") as unknown as string).dispose();
      } catch (error) {
        return (error as Error).message;
      }

      return "";
    })();

    expect(message).toContain(
      '[search-params] Unknown arrayFormat "Symbol(s)"',
    );

    // ⚑ And the REMEDY half, which nothing pinned: the sibling cells match the
    // message PREFIX only, so replacing the whole `— expected …` tail with a
    // constant survived the whole suite. Asserted as a SET rather than a literal,
    // deliberately — the list is derived from the strategy table, where the
    // order follows the declaration and not the hand-written text, so a literal
    // here would red on a change that is correct.
    //
    // ⚑ Compared as ONE object, not walked in a `for` loop. The loop form was
    // written first and reverted: emptying its list made the assertions vanish
    // in SILENCE — measured, every other cell in this file still green — and
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
    // measured: emptying either drops the file by 6 resp. 7 registered cells, with
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
