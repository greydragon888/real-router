import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

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
    describe.each(INVALID)("%s", (value) => {
      it("is refused by name on the BUILD direction", async () => {
        const router = routerWith(format.field, value);

        await expect(
          outcomeOf(format.field, () =>
            router.buildPath("x", {}, { a: format.buildValue } as SearchParams),
          ),
        ).resolves.toBe("named");

        router.dispose();
      });

      it("is refused by name on the PARSE direction", async () => {
        // The half that #1318 could not reach. Before the second half of this
        // fix the named TypeError was swallowed by the `#737` catch-all and the
        // URL simply did not match, so this cell read `accepted:
        // @@router/UNKNOWN_ROUTE` — a routing symptom for a config defect.
        const router = routerWith(format.field, value);

        await expect(
          outcomeOf(format.field, async () => {
            await router.start(format.url);

            return String(router.getState()?.name);
          }),
        ).resolves.toBe("named");

        router.dispose();
      });
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

  it("the #737 catch rethrows a THIRD error class, not merely 'not a URIError'", () => {
    // ⚑ Without this cell the narrowing is pinned by exactly two classes — a
    // `URIError` must unmatch, a `TypeError` must propagate — and ANY predicate
    // separating those two passes, INCLUDING its own complement. Measured:
    // `error instanceof URIError` swapped for `!(error instanceof TypeError)`
    // left all 4415 tests green. Two points do not determine a line.
    //
    // ⚠ The third class is REACHABLE, which also corrects the changeset's safety
    // argument. `assignParam` writes `params[name] = value` for every key except
    // `__proto__`, and the key is chosen by the URL — so on a polluted
    // `Object.prototype` the write dispatches into an application setter, inside
    // the very `try` this narrowing guards. That thrower is neither
    // `decodeURIComponent` nor `requireStrategy`. Closing it belongs to the
    // WRITE half of this class (#1792); what belongs here is that the catch does
    // not silently turn it into `UNKNOWN_ROUTE`.
    const boom = new RangeError("the application's own setter failed");

    Object.defineProperty(Object.prototype, "rrProbeKey", {
      set() {
        throw boom;
      },
      configurable: true,
    });

    const router = createRouter([{ name: "x", path: "/x?a" }]);

    try {
      // Propagates. The pre-#1796 catch-all returned `undefined` here, reporting
      // an application fault as "no such route".
      expect(() => getPluginApi(router).matchPath("/x?rrProbeKey=1")).toThrow(
        boom,
      );

      // CONTROL — the class the catch EXISTS for is still swallowed, so the cell
      // pins a narrowing rather than the absence of a catch.
      expect(getPluginApi(router).matchPath("/x?a=%E0%41")).toBeUndefined();
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
