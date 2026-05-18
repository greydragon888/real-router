/**
 * Property tests for `isSameHref` (src/href-utils.ts).
 *
 * `isSameHref` powers the same-URL guard in `NavigationPlugin.onTransitionSuccess`
 * (#580). Its only example-based coverage in `tests/functional/lifecycle.test.ts`
 * touches five concrete points; these properties cover the full input space
 * defined in INVARIANTS.md section K (K1–K9).
 */
import { fc, test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  NUM_RUNS,
  arbAnyScheme,
  arbHost,
  arbQuerySuffix,
  arbSpecialScheme,
  arbUrlPath,
  arbValidHref,
} from "./helpers";
import { isSameHref } from "../../src/href-utils";

describe("isSameHref Properties", () => {
  // ─── K1. Reflexivity ──────────────────────────────────────────────────────
  test.prop([arbValidHref], { numRuns: NUM_RUNS.standard })(
    "K1: isSameHref(h, h) === true for any canonicalised valid href",
    (href) => {
      expect(isSameHref(href, href)).toBe(true);
    },
  );

  // ─── K2. Empty / null / undefined currentHref → false ─────────────────────
  test.prop([fc.string()], { numRuns: NUM_RUNS.standard })(
    "K2a: null currentHref → false for any target",
    (target) => {
      expect(isSameHref(target, null)).toBe(false);
    },
  );

  test.prop([fc.string()], { numRuns: NUM_RUNS.standard })(
    "K2b: undefined currentHref → false for any target",
    (target) => {
      expect(isSameHref(target, undefined)).toBe(false);
    },
  );

  test.prop([fc.string()], { numRuns: NUM_RUNS.standard })(
    "K2c: empty-string currentHref → false for any target",
    (target) => {
      expect(isSameHref(target, "")).toBe(false);
    },
  );

  // ─── K3. Canonical equivalence — the #580 root invariant ─────────────────
  // K3 (general): the function is a faithful predicate of component-wise URL
  // equality, with empty pathname normalised to "/". This relaxation over
  // raw `.href` equality is required to handle non-special schemes
  // (tauri://, app://) where authority-only URLs preserve an empty pathname
  // and would otherwise compare unequal to their trailing-slash form (#580
  // first-iteration loop). Catches a regression that switched the comparison
  // back to raw string equality.
  test.prop([fc.string(), arbValidHref], { numRuns: NUM_RUNS.standard })(
    'K3: result matches component-wise canonical equality (empty pathname ≡ "/")',
    (target, base) => {
      let expected: boolean;

      try {
        const r = new URL(target, base);
        const b = new URL(base);

        expected =
          r.protocol === b.protocol &&
          r.host === b.host &&
          (r.pathname || "/") === (b.pathname || "/") &&
          r.search === b.search &&
          r.hash === b.hash;
      } catch {
        expected = false;
      }

      expect(isSameHref(target, base)).toBe(expected);
    },
  );

  test.prop([arbSpecialScheme, arbHost, arbUrlPath, arbQuerySuffix], {
    numRuns: NUM_RUNS.standard,
  })(
    "K3a: empty target against fragment-free base → true",
    (scheme, host, path, query) => {
      // Empty target inherits everything from the base EXCEPT the fragment
      // (per WHATWG URL spec). When base has no fragment, both sides
      // canonicalise to the same href.
      const base = new URL(`${scheme}://${host}${path}${query}`).href;

      expect(isSameHref("", base)).toBe(true);
    },
  );

  test.prop([arbSpecialScheme, arbHost], { numRuns: NUM_RUNS.standard })(
    "K3b: authority-only ≡ authority-with-trailing-slash for special schemes (#580 analog)",
    (scheme, host) => {
      const noSlash = `${scheme}://${host}`;
      const withSlash = `${scheme}://${host}/`;

      // URL canonicalises both to the trailing-slash form for special
      // schemes (mirrors what Safari WKWebView did to the live URL between
      // reboot 1 and reboot 2 of the bug — see #580 trace).
      expect(isSameHref(noSlash, withSlash)).toBe(true);
      expect(isSameHref(withSlash, noSlash)).toBe(true);
    },
  );

  test.prop([arbValidHref], { numRuns: NUM_RUNS.standard })(
    "K3c: fragment-bearing base + empty target → false (fragment dropped on empty target)",
    (base) => {
      // Counterpart to K3a. When the base has a fragment, empty target
      // resolves to base-without-fragment, so the comparison returns false.
      // This is the correct behaviour — a transition that wants to clear
      // the hash must go through the real navigate path.
      fc.pre(base.includes("#"));

      expect(isSameHref("", base)).toBe(false);
    },
  );

  test.prop([fc.constantFrom("tauri", "app", "custom"), arbHost], {
    numRuns: NUM_RUNS.standard,
  })(
    "K3d: non-special scheme authority-only ≡ root-path target — the actual #580 first-iteration case",
    (scheme, host) => {
      // Reproducer for the diagnostic dump from #580 at startup:
      //   currentEntry.url = "tauri://localhost"   (no trailing slash —
      //                                              non-special scheme,
      //                                              preserved by URL parser)
      //   plugin builds finalUrl = "/"
      //
      // `new URL("/", "tauri://localhost").href === "tauri://localhost/"`
      // while
      // `new URL("tauri://localhost").href      === "tauri://localhost"`
      //
      // The strings differ but the URLs identify the same logical document
      // (Tauri's WKWebView normalises authority-only URLs to add the slash
      // on the next navigation anyway). Component-wise comparison treats
      // empty pathname as "/" so the same-URL guard short-circuits the
      // cross-document reload that fires on the first iteration of #580.
      const authorityOnly = `${scheme}://${host}`;
      const rootPath = "/";
      const withSlash = `${scheme}://${host}/`;

      expect(isSameHref(rootPath, authorityOnly)).toBe(true);
      expect(isSameHref(authorityOnly, withSlash)).toBe(true);
      expect(isSameHref(withSlash, authorityOnly)).toBe(true);
    },
  );

  // ─── K4. Path discrimination ──────────────────────────────────────────────
  test.prop([arbSpecialScheme, arbHost, arbUrlPath, arbUrlPath], {
    numRuns: NUM_RUNS.standard,
  })(
    "K4: different paths under same origin → false",
    (scheme, host, p1, p2) => {
      fc.pre(p1 !== p2);

      const base = `${scheme}://${host}${p1}`;
      const target = `${scheme}://${host}${p2}`;

      expect(isSameHref(target, base)).toBe(false);
    },
  );

  // ─── K5. Hash discrimination ──────────────────────────────────────────────
  test.prop([arbSpecialScheme, arbHost, arbUrlPath], {
    numRuns: NUM_RUNS.standard,
  })("K5: different hash under same path → false", (scheme, host, path) => {
    const base = `${scheme}://${host}${path}#alpha`;
    const target = `${scheme}://${host}${path}#beta`;

    expect(isSameHref(target, base)).toBe(false);
  });

  // ─── K6. Query discrimination ─────────────────────────────────────────────
  test.prop([arbSpecialScheme, arbHost, arbUrlPath], {
    numRuns: NUM_RUNS.standard,
  })("K6: different query under same path → false", (scheme, host, path) => {
    const base = `${scheme}://${host}${path}?v=1`;
    const target = `${scheme}://${host}${path}?v=2`;

    expect(isSameHref(target, base)).toBe(false);
  });

  // ─── K7. Origin discrimination ────────────────────────────────────────────
  test.prop([arbSpecialScheme, arbHost, arbHost, arbUrlPath], {
    numRuns: NUM_RUNS.standard,
  })("K7: different hosts under same path → false", (scheme, h1, h2, path) => {
    fc.pre(h1 !== h2);

    const base = `${scheme}://${h1}${path}`;
    const target = `${scheme}://${h2}${path}`;

    expect(isSameHref(target, base)).toBe(false);
  });

  // ─── K8. Totality ─────────────────────────────────────────────────────────
  test.prop([fc.string(), fc.string()], { numRuns: NUM_RUNS.standard })(
    "K8a: never throws on arbitrary string × string inputs",
    (target, currentHref) => {
      expect(typeof isSameHref(target, currentHref)).toBe("boolean");
    },
  );

  test.prop(
    [fc.string(), fc.oneof(fc.constant(null), fc.constant(undefined))],
    { numRuns: NUM_RUNS.fast },
  )(
    "K8b: never throws when currentHref is null/undefined",
    (target, currentHref) => {
      expect(typeof isSameHref(target, currentHref)).toBe("boolean");
    },
  );

  test.prop([arbAnyScheme, arbHost], { numRuns: NUM_RUNS.fast })(
    "K8c: never throws across all schemes (special + custom)",
    (scheme, host) => {
      // Custom-scheme href is not guaranteed canonical-equivalent to itself
      // across implementations, so we only verify totality here — boolean
      // return, no thrown exception.
      const href = `${scheme}://${host}/path`;

      expect(typeof isSameHref(href, href)).toBe("boolean");
      expect(typeof isSameHref("", href)).toBe("boolean");
    },
  );

  // ─── K9. Determinism ──────────────────────────────────────────────────────
  test.prop([fc.string(), fc.string()], { numRuns: NUM_RUNS.fast })(
    "K9: deterministic — repeated calls with same args return same result",
    (target, currentHref) => {
      const first = isSameHref(target, currentHref);
      const second = isSameHref(target, currentHref);
      const third = isSameHref(target, currentHref);

      expect(second).toBe(first);
      expect(third).toBe(first);
    },
  );
});
