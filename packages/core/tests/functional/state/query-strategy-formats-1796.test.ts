import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";

import type { SearchParams } from "@real-router/core/types";

/**
 * An invalid `queryParams` format must fail with its NAMED error in BOTH
 * directions — and a prototype member's name is an invalid format like any other
 * (#1796).
 *
 * `requireStrategy` (`engine/search-params/strategies/index.ts`) tested for a
 * missing strategy with `strategy === undefined`, after the caller had already
 * indexed a plain object literal. For the twelve inherited names that lookup
 * returns a FUNCTION, so the guard passed and a native method was installed as
 * the live strategy — the exact deferred `TypeError` #1318 added this guard to
 * prevent, now reached through the one value class its predicate cannot see.
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
