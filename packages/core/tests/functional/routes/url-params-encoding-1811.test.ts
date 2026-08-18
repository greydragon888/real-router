import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * An unrecognised `urlParamsEncoding` must DEGRADE to the default encoder, not
 * install whatever the lookup returned (#1811).
 *
 * The option indexes two plain object literals — `ENCODING_METHODS` and
 * `DECODING_METHODS` (`engine/path-matcher/encoding.ts`) — and did so with **no
 * existence check at all**, which is the same predicate blind spot as #1796 one
 * layer over, minus the guard. Three distinct failures, measured against `src`
 * with `buildPath("x", { id: "a b" })` on `/x/:id`:
 *
 *     "toString"     → "/x/[object Object]", and matchPath reads it straight back
 *     "valueOf"      → the same; the param VALUE is destroyed in both directions
 *     "constructor"  → "/x/a b" — `Object` becomes the encoder and passes the
 *                      value through, so a space lands RAW in state.path
 *     "bogusTypo"    → deferred `TypeError: slot.encoder is not a function`,
 *                      thrown from inside buildPath with nothing naming the option
 *
 * ⚑ **The fix degrades rather than throws, and that was decided by measurement,
 * not by taste.** `options.test.ts` carries a `🔴 CRITICAL` family of three cells
 * asserting that bare core does NOT throw on an invalid `trailingSlash` /
 * `queryParamsMode` / `urlParamsEncoding`. Probing all three showed the symmetry
 * was only skin-deep: the first two fall back to their default and the router
 * keeps working, while the third did not tolerate anything — its cell passed
 * merely because the crash arrived later, from a different call. So this is not
 * core adopting a new strictness; it is the one option that was NOT tolerant
 * becoming so. Rejecting the value by NAME stays with
 * `@real-router/validation-plugin`, which already owns this exact allowed list —
 * a throw here would shadow its better-worded message.
 *
 * ⚑ One check, in `SegmentMatcher`'s constructor, and that is not a shortcut: all
 * THREE index sites — the decoder at `SegmentMatcher.ts`, `encodeParam`
 * (`encoding.ts`) and `makeBuildParamSlot` (`registration/buildParts.ts`) — read
 * the value from `#options.urlParamsEncoding`, which the constructor fixes once
 * (traced: `registerTree` hands its own `#options` to `registerNode`, which
 * passes `state.options.urlParamsEncoding` down).
 *
 * ⚠ `"none"` and `"constructor"` used to produce the SAME output (`/x/a b`) —
 * `"none"` is the identity encoder and `"constructor"` counterfeited it. The
 * valid column below is what keeps them apart.
 */
describe("an unrecognised urlParamsEncoding degrades to the default (#1811)", () => {
  /** Every value the two encoder tables actually carry. */
  const VALID = ["default", "uri", "uriComponent", "none"];

  const INVALID = [
    "bogusTypo",
    "toString",
    "constructor",
    "valueOf",
    "__proto__",
  ];

  const routerWith = (
    option: Record<string, unknown>,
  ): ReturnType<typeof createRouter> =>
    createRouter(
      [
        { name: "x", path: "/x/:id" },
        { name: "home", path: "/home" },
      ],
      option as never,
    );

  /**
   * A pure DESCRIBER: the two facts that together say "the encoder behaved" are
   * compared in ONE `expect`, so a failure shows which of them broke.
   */
  /**
   * ⚑ The probe value separates all FOUR encoders, and that is measured rather
   * than chosen for looks. The obvious `"a b"` does NOT: `default`, `uri` and
   * `uriComponent` all print `a%20b`, so three of the four VALID cells asserted
   * output byte-identical to the INVALID column, and a fallback swallowing `uri`
   * and `uriComponent` into `default` left every cell green. Here `@` separates
   * `uri` (keeps it) from `default` (escapes it), `:` and `+` separate
   * `uriComponent` (escapes them) from `default` (keeps them as sub-delims), and
   * the space separates `none` from all three. Verified through the real router:
   * four distinct hrefs, every one round-tripping.
   */
  const PROBE = "a@b:c+d e";

  const ENCODED: Readonly<Record<string, string>> = {
    default: "/x/a%40b:c+d%20e",
    uri: "/x/a@b:c+d%20e",
    uriComponent: "/x/a%40b%3Ac%2Bd%20e",
    none: "/x/a@b:c+d e",
  };

  const describeEncoding = (
    option: Record<string, unknown>,
  ): Record<string, unknown> => {
    const router = routerWith(option);

    try {
      const href = router.buildPath("x", { id: PROBE });

      return {
        href,
        roundTripped: getPluginApi(router).matchPath(href)?.params.id,
      };
    } catch (error) {
      return { href: `THREW: ${(error as Error).message}`, roundTripped: null };
    } finally {
      router.dispose();
    }
  };

  /**
   * `buildPath` with an UNDECLARED query key — the one input the three
   * `queryParamsMode` values disagree about, and the reason the mode needs a
   * probe of its own: `describeEncoding` passes no query bag, so every mode is
   * byte-identical there.
   */
  const withUndeclaredQuery = (mode: string): string => {
    const router = routerWith({ queryParamsMode: mode });

    try {
      return router.buildPath("x", { id: "a" }, { undeclared: "1" });
    } finally {
      router.dispose();
    }
  };

  /** What the default encoder produces — the shape every unrecognised value must fall back to. */
  const DEFAULT_ENCODED = { href: ENCODED.default, roundTripped: PROBE };

  it.each(INVALID)(
    "%s falls back to the default encoder instead of being installed",
    (encoding) => {
      expect(describeEncoding({ urlParamsEncoding: encoding })).toStrictEqual(
        DEFAULT_ENCODED,
      );
    },
  );

  it.each(VALID)(
    "%s is honoured, not swallowed by the fallback",
    (encoding) => {
      // The column that stops the fallback degenerating into "every value is
      // `default`" — and the one that pins `"none"` apart from the `"constructor"`
      // that used to counterfeit it.
      expect(describeEncoding({ urlParamsEncoding: encoding })).toStrictEqual({
        href: ENCODED[encoding],
        roundTripped: PROBE,
      });
    },
  );

  it("CONTROL — an invalid value degrades on all three enum options, differently", () => {
    // The symmetry the `🔴 CRITICAL` family in options.test.ts asserts by name and
    // did NOT have: its two siblings fell back and kept working, while this one
    // crashed from a later call. Pinned as a cross-option table so a future
    // strictness added to ONE of them is visible as the divergence it is.
    //
    // ⚑ "Degrade alike" was the title until it was measured, and it is FALSE.
    // `trailingSlash` and `urlParamsEncoding` fall back to their own defaults
    // ("preserve" / "default"). `queryParamsMode` does not: its default is
    // **"loose"** (OptionsNamespace/constants.ts), and an unrecognised value
    // behaves like "default"/"strict" — it DROPS an undeclared query key where the
    // real default prints it. So the shared property is "degrades instead of
    // crashing", not "degrades to its default", and the third row is anchored on
    // what it actually does.
    //
    // ⚠ A row is only worth something if its option is OBSERVABLE in that row's
    // probe. `describeEncoding`'s `buildPath("x", { id })` sees `urlParamsEncoding`
    // and `trailingSlash` (a valid "always" moves its output) but NOT
    // `queryParamsMode` — measured, even a valid "loose" is byte-identical there,
    // because no query bag is passed. That row gets its own probe.
    expect({
      trailingSlash: describeEncoding({ trailingSlash: "INVALID" }),
      urlParamsEncoding: describeEncoding({ urlParamsEncoding: "INVALID" }),
      // Anchored on the OUTCOME, not on a sibling call, so the row cannot be
      // satisfied by an option nothing reads: the key is dropped, and the real
      // default would have printed it.
      queryParamsModeDropsIt: withUndeclaredQuery("INVALID"),
      queryParamsModeDefaultPrintsIt: withUndeclaredQuery("loose"),
      // The positive control for the two rows above.
      queryParamsModeIsObservable:
        withUndeclaredQuery("loose") !== withUndeclaredQuery("strict"),
    }).toStrictEqual({
      trailingSlash: DEFAULT_ENCODED,
      urlParamsEncoding: DEFAULT_ENCODED,
      queryParamsModeDropsIt: "/x/a",
      queryParamsModeDefaultPrintsIt: "/x/a?undeclared=1",
      queryParamsModeIsObservable: true,
    });
  });

  it("CONTROL — the queryParamsMode row above needs BOTH of its gates", () => {
    // ⚑ `buildPath` consults the mode TWICE, in series and independently — the
    // pipeline port (`admitsUndeclaredQuery`) and the matcher's own query builder
    // — so an end-to-end probe stays green when either ONE regresses, and the row
    // above proves nothing about either gate alone. Measured: breaking either
    // single gate leaves the whole file passing; only both together red it.
    //
    // This cell names that limit rather than pretending it away. The two gates are
    // pinned individually where each lives — the port by
    // `undeclared-query-mode-gate.test.ts`, the matcher by the engine's own
    // query-build tier — and what belongs HERE is the seam: the mode a caller sets
    // must reach both, which is observable as the modes disagreeing.
    expect({
      loose: withUndeclaredQuery("loose"),
      default: withUndeclaredQuery("default"),
      strict: withUndeclaredQuery("strict"),
    }).toStrictEqual({
      loose: "/x/a?undeclared=1",
      default: "/x/a",
      strict: "/x/a",
    });
  });

  it("the MATCH direction changes too — decoding and %-validation now run", () => {
    // Not only the build direction, which is the half the changeset used to
    // describe. An unrecognised encoding used to leave `#decode` as `undefined`,
    // and `#decodeParams` short-circuits on a falsy decoder — so decoding AND
    // percent-validation were both skipped and the matcher behaved exactly like
    // `"none"`. The fallback turns both back on, which is a real behaviour change
    // on an already-misconfigured router: a URL that used to resolve can now 404.
    const broken = getPluginApi(
      routerWith({ urlParamsEncoding: "bogusTypo" }),
    ).matchPath("/x/a%40b");
    const asNone = getPluginApi(
      routerWith({ urlParamsEncoding: "none" }),
    ).matchPath("/x/a%40b");

    expect({
      // decoded now, raw before (and raw is still what "none" gives)
      fallback: broken?.params.id,
      none: asNone?.params.id,
      // an invalid percent sequence is now REJECTED; it used to match raw
      invalidPercent: getPluginApi(
        routerWith({ urlParamsEncoding: "bogusTypo" }),
      ).matchPath("/x/%E0%41"),
      invalidPercentAsNone: getPluginApi(
        routerWith({ urlParamsEncoding: "none" }),
      ).matchPath("/x/%E0%41")?.params.id,
    }).toStrictEqual({
      fallback: "a@b",
      none: "a%40b",
      invalidPercent: undefined,
      invalidPercentAsNone: "%E0%41",
    });
  });

  it("BOUNDARY — getOptions() still echoes the REQUESTED value, not the effective one", () => {
    // A divergence this fallback INTRODUCES, pinned rather than papered over.
    // `getOptions()` reports the router's raw options while the matcher is the
    // authority on which encoder actually runs, so for an unrecognised value the
    // two now disagree. Before the fallback they agreed — and were both wrong
    // (the native method really was installed), so this is a strictly better
    // state, not a regression: the only configs that can reach it are ones
    // `@real-router/validation-plugin` refuses outright.
    //
    // ⚑ Pinned because the tempting "fix" is to normalise in `OptionsNamespace`
    // too, which would put the same fallback in two places — the second source of
    // truth this class of bug is made of. If the echo should ever become
    // effective-value-based, it belongs in ONE owner, not mirrored here.
    const router = routerWith({ urlParamsEncoding: "toString" });

    expect({
      echoed: getPluginApi(router).getOptions().urlParamsEncoding,
      effective: router.buildPath("x", { id: PROBE }),
    }).toStrictEqual({ echoed: "toString", effective: ENCODED.default });

    router.dispose();
  });

  it("CONTROL — the table is non-empty and its two columns are disjoint", () => {
    // ⚑ Non-vacuity, OUTSIDE `it.each`: an empty list registers ZERO cells in
    // silence. Each list gets its OWN threshold — a count on one does not reach
    // the other, and a derived list does not inherit its parent's.
    expect(VALID).toHaveLength(4);
    expect(INVALID.length).toBeGreaterThanOrEqual(5);

    // The invalid column must carry BOTH classes: an ordinary typo (which used to
    // defer a TypeError) and prototype members (which used to corrupt silently).
    expect(INVALID).toContain("bogusTypo");
    expect(INVALID).toContain("toString");

    // Disjoint, or the valid column stops proving the fallback discriminates.
    for (const encoding of INVALID) {
      expect(VALID).not.toContain(encoding);
    }
  });
});
