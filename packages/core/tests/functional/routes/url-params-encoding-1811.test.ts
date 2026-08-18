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
  const describeEncoding = (
    option: Record<string, unknown>,
  ): Record<string, unknown> => {
    const router = routerWith(option);

    try {
      const href = router.buildPath("x", { id: "a b" });

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

  /** What the default encoder produces — the shape every unrecognised value must fall back to. */
  const DEFAULT_ENCODED = { href: "/x/a%20b", roundTripped: "a b" };

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
        href: encoding === "none" ? "/x/a b" : "/x/a%20b",
        roundTripped: "a b",
      });
    },
  );

  it("CONTROL — the three enum options now degrade alike", () => {
    // The symmetry the `🔴 CRITICAL` family in options.test.ts asserts by name and
    // did NOT have: its two siblings fell back to their default and kept working,
    // while this one crashed from a later call. Pinned as a cross-option table so
    // a future strictness added to ONE of them is visible as the divergence it is.
    const invalid = {
      trailingSlash: describeEncoding({ trailingSlash: "INVALID" }),
      queryParamsMode: describeEncoding({ queryParamsMode: "INVALID" }),
      urlParamsEncoding: describeEncoding({ urlParamsEncoding: "INVALID" }),
    };

    expect(invalid).toStrictEqual({
      trailingSlash: DEFAULT_ENCODED,
      queryParamsMode: DEFAULT_ENCODED,
      urlParamsEncoding: DEFAULT_ENCODED,
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
      effective: router.buildPath("x", { id: "a b" }),
    }).toStrictEqual({ echoed: "toString", effective: "/x/a%20b" });

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
