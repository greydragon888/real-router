// packages/svelte/tests/property/buildHref.properties.ts

/**
 * Property-based tests for `buildHref` from `shared/dom-utils/link-utils.ts`.
 *
 * Closes review §2.2 gaps for `buildHref`:
 * - Idempotence (MEDIUM): same args → same result
 * - Hash leading-`#` stripping (MEDIUM): `<Link hash="#x">` ≡ `<Link hash="x">`
 * - encodeURI hash fragment correctness (HIGH): #532 RFC 3986 surface +
 *   defensive `#` → `%23` replacement; without this, hash injection paths leak
 * - Fallback на `buildPath` when `buildUrl` undefined (LOW)
 * - Invalid routeName → undefined + console.error (LOW)
 * - opts pass-through: `buildUrl` receives `{ hash }`, not `{ hash: undefined }`
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import {
  NUM_RUNS,
  arbDottedNameExtended,
  arbHash,
  arbParamsExtended,
} from "./helpers";
import { buildHref } from "../../src/dom-utils";

import type { Router } from "@real-router/core";

// Independent re-derivation of encodeFragmentInline's strict #1211 formula: the
// drift sentinel asserts buildHref matches it WITHOUT importing the production
// function (which would be a tautology). Local per adapter — the shared
// `__test-helpers` mirror was retired once the encoder became a one-liner.
const computeExpectedFragment = (rawHash: string): string =>
  encodeURI(rawHash).replaceAll("#", "%23");

function makeFakeRouter(
  buildUrl:
    | ((
        name: string,
        params: object,
        search?: object,
        options?: { hash?: string },
      ) => string | undefined)
    | undefined,
  buildPath: (name: string, params: object, search?: object) => string,
): Router {
  return { buildUrl, buildPath } as unknown as Router;
}

describe("buildHref — Property Tests", () => {
  // Closes review §6 MEDIUM #1: Inv1-4 are the most combinatorially rich
  // properties (routeName × params × buildUrl × buildPath; idempotence over
  // every input shape; error path coverage). 100 runs left under-sampled
  // corners around the buildUrl-defined-but-returns-undefined boundary and
  // the both-throw error path. `thorough` (200) doubles the coverage at
  // minimal CI cost (~50ms extra per file).
  describe("Invariant 1: Falls back to buildPath when buildUrl returns undefined", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 16 })], {
      numRuns: NUM_RUNS.thorough,
    })("buildUrl=()=>undefined uses buildPath result", (path) => {
      const router = makeFakeRouter(
        () => undefined,
        () => path,
      );

      expect(buildHref(router, "any", {})).toBe(path);
    });
  });

  describe("Invariant 2: Prefers buildUrl when defined and returns a string", () => {
    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 16 }),
        fc.string({ minLength: 1, maxLength: 16 }),
      ],
      { numRuns: NUM_RUNS.thorough },
    )("returns buildUrl result, not buildPath", (url, path) => {
      const router = makeFakeRouter(
        () => url,
        () => path,
      );

      expect(buildHref(router, "any", {})).toBe(url);
    });
  });

  describe("Invariant 3: Idempotence — same args produce the same result", () => {
    // `buildHref` is referentially transparent: no side effects on success, no
    // observable internal state. Repeating an identical call must return an
    // identical string. A regression that memoized incorrectly or carried
    // state between calls would surface here.
    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 16 }),
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "two consecutive calls with the same args yield the same href",
      (name, path) => {
        const router = makeFakeRouter(undefined, () => path);
        const a = buildHref(router, name, {});
        const b = buildHref(router, name, {});

        expect(a).toBe(b);
      },
    );

    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 16 }),
        arbHash,
      ],
      { numRuns: NUM_RUNS.thorough },
    )(
      "two consecutive calls with the same args + hash yield the same href",
      (name, path, hash) => {
        const router = makeFakeRouter(undefined, () => path);
        const a = buildHref(router, name, {}, undefined, hash);
        const b = buildHref(router, name, {}, undefined, hash);

        expect(a).toBe(b);
      },
    );
  });

  describe("Invariant 4: Returns undefined and logs error when buildUrl/buildPath throw", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.thorough,
    })("invalid routeName → undefined + console.error", (name) => {
      const router = makeFakeRouter(
        () => {
          throw new Error("no");
        },
        () => {
          throw new Error("no");
        },
      );
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(buildHref(router, name, {})).toBeUndefined();
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /^\[real-router\] Route ".+" is not defined\. The element will render without an href attribute\.$/,
        ),
      );

      errSpy.mockRestore();
    });
  });

  // Closes review §6 LOW #4: explicit `test.each` pin-test for RFC 3986
  // sub-delimiters. Inv5/Inv12 already exercise encodeURI behaviour
  // probabilistically, but property tests rarely shrink to the canonical
  // single-character sub-delim cases. The table here locks the exact
  // expected-output for each sub-delim, so a regression that switched to a
  // stricter encoder (e.g. `encodeURIComponent`, which DOES percent-encode
  // `&=?:`) surfaces with a clear "expected '&' got '%26'" message.
  describe("Invariant 5b: RFC 3986 sub-delimiters preserved verbatim by encodeURI", () => {
    // encodeURI does NOT percent-encode: `;/?:@&=+$,#`
    // Source: MDN encodeURI — "characters that are part of the URI syntax"
    // The defensive `.replaceAll("#", "%23")` is layered on top to ensure the
    // fragment cannot contain an unescaped `#` (which would split it).
    const SUB_DELIM_CASES: readonly (readonly [string, string])[] = [
      ["a&b", "a&b"], // ampersand — query-param separator
      ["a=b", "a=b"], // equals — query-param assignment
      ["a?b", "a?b"], // question mark — query string separator
      ["a:b", "a:b"], // colon — scheme/auth/port separator
      ["a;b", "a;b"], // semicolon — historical param separator
      ["a@b", "a@b"], // at — userinfo separator
      ["a,b", "a,b"], // comma — list separator
      ["a$b", "a$b"], // dollar — RFC 3986 sub-delim
      ["a+b", "a+b"], // plus — RFC 3986 sub-delim (NOT space, that's form-encoding)
      ["a/b", "a/b"], // slash — path segment separator
      ["tab=1&q=x", "tab=1&q=x"], // composite — multiple sub-delims unchanged
      ["q=foo&sort=desc", "q=foo&sort=desc"], // realistic query-string fragment
    ];

    it.each(SUB_DELIM_CASES)(
      "fragment '%s' → '%s' (sub-delim preserved by encodeURI)",
      (input, expected) => {
        const router = makeFakeRouter(undefined, () => "/p");
        const href = buildHref(router, "any", {}, undefined, input);

        expect(href).toBe(`/p#${expected}`);
      },
    );

    it("composite sub-delims with `#` mixed in → `#` becomes %23, others preserved", () => {
      // Defensive `%23` replacement fires after encodeURI, so a hash like
      // "a&b#c=d" yields "a&b%23c=d" — `&` and `=` survive verbatim, only
      // `#` is escaped.
      const router = makeFakeRouter(undefined, () => "/p");
      const href = buildHref(router, "any", {}, undefined, "a&b#c=d");

      expect(href).toBe("/p#a&b%23c=d");
    });
  });

  describe("Invariant 5: Hash encoding (RFC 3986 + defensive %23 for #)", () => {
    // #532 contract: the buildPath fallback appends an encoded hash. Encoding
    // must use `encodeURI` (preserves sub-delims `&=?:`) and defensively
    // replace `#` with `%23` because encodeURI does NOT touch `#`. Without
    // the `%23` replacement, a hash like "a#b" would yield `…#a#b`, which
    // browsers interpret as a different fragment. This guards against a
    // future refactor that swaps in a less strict encoder.
    test.prop([arbHash, fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.thorough,
    })("fallback path → hash is encodeURI'd and # → %23", (rawHash, path) => {
      const router = makeFakeRouter(undefined, () => path);
      const href = buildHref(router, "any", {}, undefined, rawHash);

      const stripped = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;

      if (!stripped) {
        expect(href).toBe(path);

        return;
      }

      const expectedHash = computeExpectedFragment(stripped);

      expect(href).toBe(`${path}#${expectedHash}`);

      // No literal `#` in the fragment portion — verifies the defensive
      // %23 replacement actually fired.
      const fragment = href!.slice(`${path}#`.length);

      expect(fragment).not.toContain("#");
    });
  });

  describe("Invariant 6: Leading `#` is stripped before encoding/forwarding", () => {
    // `<Link hash="#section">` and `<Link hash="section">` must produce the
    // same href — the leading `#` is a convenience for consumers who paste
    // the literal fragment, not part of the fragment itself.
    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 12 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )("hash='#x' and hash='x' produce identical href", (rawHash, path) => {
      // rawHash must not already start with "#" so we can prepend one safely.
      fc.pre(!rawHash.startsWith("#"));

      const router = makeFakeRouter(undefined, () => path);

      const withHash = buildHref(router, "any", {}, undefined, `#${rawHash}`);
      const withoutHash = buildHref(router, "any", {}, undefined, rawHash);

      expect(withHash).toBe(withoutHash);
    });
  });

  describe("Invariant 7: buildUrl receives { hash } object, not { hash: undefined }", () => {
    // Plugins like browser-plugin distinguish `options === undefined` (no hash
    // intent) from `options = { hash: "" }` (explicit empty fragment). The
    // helper must NOT call buildUrl with `{ hash: undefined }` — that would
    // mislead plugins about consumer intent.
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("no-hash call → buildUrl receives options=undefined", (name) => {
      const calls: { options: unknown }[] = [];
      const router = makeFakeRouter(
        (_n, _p, _search, options) => {
          calls.push({ options });

          return "/url";
        },
        () => "/path",
      );

      buildHref(router, name, {});

      expect(calls).toHaveLength(1);
      expect(calls[0].options).toBeUndefined();
    });

    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 0, maxLength: 12 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "with-hash call → buildUrl receives { hash: <stripped> }",
      (name, rawHash) => {
        const calls: { options: unknown }[] = [];
        const router = makeFakeRouter(
          (_n, _p, _search, options) => {
            calls.push({ options });

            return "/url";
          },
          () => "/path",
        );

        buildHref(router, name, {}, undefined, rawHash);

        expect(calls).toHaveLength(1);

        const stripped = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;

        expect(calls[0].options).toStrictEqual({ hash: stripped });
      },
    );

    // Pin-test the empty-string case explicitly. The property test above
    // accepts `minLength: 0`, but fast-check rarely shrinks down to `""` —
    // and a regression that conflated `hash === ""` with `hash === undefined`
    // (e.g. by stripping falsy values from the options object) would let the
    // property suite pass while breaking the tri-state contract: `""` MUST be
    // forwarded as `{ hash: "" }`, NOT collapsed.
    test("with-hash call where hash='' → buildUrl receives { hash: '' } (not collapsed to undefined)", () => {
      const calls: { options: unknown }[] = [];
      const router = makeFakeRouter(
        (_n, _p, _search, options) => {
          calls.push({ options });

          return "/url";
        },
        () => "/path",
      );

      buildHref(router, "home", {}, undefined, "");

      expect(calls).toHaveLength(1);
      expect(calls[0].options).toStrictEqual({ hash: "" });
    });
  });

  // Closes review §2.4: `arbDottedName` did not cover real-world route names
  // with digits, `-`, or `_` (`users-list`, `posts_2024`, `v1.users`). The
  // helper passes routeName verbatim through `router.buildUrl(name, …)` /
  // `router.buildPath(name, …)`. If a future refactor sanitized the name
  // (e.g. lowercased it) the resulting href would no longer match the
  // registered route. Locking the verbatim contract.
  describe("Invariant 8: Route names with digits / dashes / underscores pass through verbatim", () => {
    test.prop(
      [arbDottedNameExtended, fc.string({ minLength: 1, maxLength: 16 })],
      { numRuns: NUM_RUNS.standard },
    )(
      "buildPath receives the route name unchanged for extended-ASCII names",
      (routeName, path) => {
        const namesPassed: string[] = [];
        const router = {
          buildUrl: undefined,
          buildPath: (name: string) => {
            namesPassed.push(name);

            return path;
          },
        } as unknown as import("@real-router/core").Router;

        buildHref(router, routeName, {});

        expect(namesPassed).toStrictEqual([routeName]);
      },
    );

    test.prop(
      [arbDottedNameExtended, fc.string({ minLength: 1, maxLength: 16 })],
      { numRuns: NUM_RUNS.standard },
    )(
      "buildUrl receives the route name unchanged for extended-ASCII names",
      (routeName, url) => {
        const namesPassed: string[] = [];
        const router = {
          buildUrl: (name: string) => {
            namesPassed.push(name);

            return url;
          },
          buildPath: () => "/path",
        } as unknown as import("@real-router/core").Router;

        buildHref(router, routeName, {});

        expect(namesPassed).toStrictEqual([routeName]);
      },
    );
  });

  // Closes review §5.2 row 9: buildPath throwing while buildUrl is undefined
  // is the standard "URL plugin absent, route invalid" path. Inv4 already
  // covers the both-throw case; this isolates the buildPath-only path so a
  // regression that silently swallowed buildPath errors only (e.g. swallowed
  // them in a try/catch around `router.buildPath` while leaving buildUrl
  // bubbling up) would surface here.
  describe("Invariant 9: buildPath alone throws (buildUrl undefined) → undefined + console.error", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })(
      "buildUrl=undefined, buildPath throws → undefined + console.error",
      (name) => {
        const router = makeFakeRouter(undefined, () => {
          throw new Error("invalid route");
        });
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        expect(buildHref(router, name, {})).toBeUndefined();
        expect(errSpy).toHaveBeenCalledTimes(1);
        expect(errSpy).toHaveBeenCalledWith(
          expect.stringContaining(
            `[real-router] Route "${name}" is not defined`,
          ),
        );

        errSpy.mockRestore();
      },
    );
  });

  // Closes review §6 MEDIUM #2: `arbParamsExtended` extends the standard
  // params generator with `null` / `undefined` values. The helper is
  // content-agnostic about value types — it must NOT short-circuit on
  // nullish values, must NOT JSON-coerce them, and the underlying
  // `router.buildUrl` / `router.buildPath` must receive the literal `null`
  // / `undefined` for downstream serialization. Pins this contract under
  // arbitrary nullish-rich params shapes.
  describe("Invariant 10b: arbParamsExtended (null / undefined values) forwarded verbatim", () => {
    test.prop([arbParamsExtended], { numRuns: NUM_RUNS.standard })(
      "buildUrl receives the exact params object (no nullish stripping)",
      (params) => {
        const calls: { params: unknown }[] = [];
        const router = {
          buildUrl: (_name: string, p: object) => {
            calls.push({ params: p });

            return "/url";
          },
          buildPath: () => "/path",
        } as unknown as import("@real-router/core").Router;

        buildHref(router, "test", params);

        expect(calls).toHaveLength(1);
        // Same reference handed through verbatim — no defensive copy, no
        // nullish coercion, no JSON round-trip.
        expect(calls[0].params).toBe(params);
      },
    );

    test.prop([arbParamsExtended], { numRuns: NUM_RUNS.standard })(
      "buildPath receives the exact params object (no nullish stripping)",
      (params) => {
        const calls: { params: unknown }[] = [];
        const router = {
          buildUrl: undefined,
          buildPath: (_name: string, p: object) => {
            calls.push({ params: p });

            return "/path";
          },
        } as unknown as import("@real-router/core").Router;

        buildHref(router, "test", params);

        expect(calls).toHaveLength(1);
        expect(calls[0].params).toBe(params);
      },
    );
  });

  // Closes review §5.2 row 10: when consumers pass non-string primitives
  // (BigInt, Symbol, Date) as route params, the helper forwards them
  // verbatim to buildUrl / buildPath. The helper does NOT JSON.stringify or
  // coerce the params — that's the router's job. Locks the verbatim-passthrough
  // contract: any future refactor that pre-coerces params would surface here.
  //
  // Helper casts use `as unknown as Params` because `Params` is intentionally
  // typed against string|number|boolean — we're testing the runtime escape
  // hatch consumers actually exercise when integrating non-standard plugins.
  describe("Invariant 10: Non-string routeParams (BigInt, Symbol, Date) pass through verbatim", () => {
    test("BigInt param → forwarded by reference", () => {
      const calls: { params: unknown }[] = [];
      const router = {
        buildUrl: (_name: string, params: object) => {
          calls.push({ params });

          return "/url";
        },
        buildPath: () => "/path",
      } as unknown as import("@real-router/core").Router;

      const params = {
        id: 12_345n,
      } as unknown as import("@real-router/core").Params;

      buildHref(router, "test", params);

      expect(calls).toHaveLength(1);
      expect(calls[0].params).toBe(params); // same ref
      expect((calls[0].params as { id: bigint }).id).toBe(12_345n);
    });

    test("Symbol param → forwarded by reference", () => {
      const sym = Symbol("test");
      const calls: { params: unknown }[] = [];
      const router = {
        buildUrl: (_name: string, params: object) => {
          calls.push({ params });

          return "/url";
        },
        buildPath: () => "/path",
      } as unknown as import("@real-router/core").Router;

      const params = {
        token: sym,
      } as unknown as import("@real-router/core").Params;

      buildHref(router, "test", params);

      expect(calls).toHaveLength(1);
      expect((calls[0].params as { token: symbol }).token).toBe(sym);
    });

    test("Date param → forwarded by reference (no .toISOString() coercion)", () => {
      const date = new Date("2026-05-13T00:00:00.000Z");
      const calls: { params: unknown }[] = [];
      const router = {
        buildUrl: (_name: string, params: object) => {
          calls.push({ params });

          return "/url";
        },
        buildPath: () => "/path",
      } as unknown as import("@real-router/core").Router;

      const params = {
        at: date,
      } as unknown as import("@real-router/core").Params;

      buildHref(router, "test", params);

      expect(calls).toHaveLength(1);
      expect((calls[0].params as { at: Date }).at).toBe(date);
    });

    test("router that JSON.stringify's params with BigInt → TypeError → undefined + console.error", () => {
      // Realistic: many URL plugins serialize params via JSON.stringify
      // (which throws on BigInt: "Do not know how to serialize a BigInt").
      // The helper's try/catch must surface that as the standard "Route not
      // defined" error path — no leaked TypeError to the consumer's render.
      const router = {
        buildUrl: undefined,
        buildPath: (_name: string, params: object) => {
          // JSON.stringify on { id: 12345n } throws TypeError.
          JSON.stringify(params);

          return "/path";
        },
      } as unknown as import("@real-router/core").Router;
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = buildHref(router, "test", {
        id: 12_345n,
      } as unknown as import("@real-router/core").Params);

      expect(result).toBeUndefined();
      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[real-router] Route "test" is not defined`),
      );

      errSpy.mockRestore();
    });
  });

  // Closes review §5.2 row 11: extremely long routeName + Unicode characters
  // must pass through verbatim. The helper does not validate or truncate the
  // name. While route-utils' SAFE_SEGMENT_PATTERN rejects Unicode at runtime
  // (no `u` flag on `\w`), buildHref itself is content-agnostic — any
  // pre-validation belongs to the router layer.
  describe("Invariant 11: Long routeName + Unicode pass through verbatim", () => {
    test("very long routeName (1024 chars) → forwarded unchanged", () => {
      const longName = "a".repeat(1024);
      const namesPassed: string[] = [];
      const router = {
        buildUrl: undefined,
        buildPath: (name: string) => {
          namesPassed.push(name);

          return "/p";
        },
      } as unknown as import("@real-router/core").Router;

      buildHref(router, longName, {});

      expect(namesPassed).toStrictEqual([longName]);
      expect(namesPassed[0]).toHaveLength(1024);
    });

    test("Unicode routeName (BMP letters + emoji) → forwarded verbatim", () => {
      // The helper is content-agnostic: route-utils may reject these at the
      // router layer, but buildHref must not pre-validate or transform. If
      // it ever URL-encoded the name, paths to deliberately Unicode-routed
      // pages (used in some i18n setups via custom matchers) would break.
      const unicodeName = "пользователь.profile.用户";
      const emojiName = "page-🎉";
      const namesPassed: string[] = [];
      const router = {
        buildUrl: undefined,
        buildPath: (name: string) => {
          namesPassed.push(name);

          return "/p";
        },
      } as unknown as import("@real-router/core").Router;

      buildHref(router, unicodeName, {});
      buildHref(router, emojiName, {});

      expect(namesPassed).toStrictEqual([unicodeName, emojiName]);
    });
  });

  // Closes review §8.1 row 2 (drift-safety): `encodeFragmentInline` in
  // `shared/dom-utils/link-utils.ts` and `encodeHashFragment` in
  // `shared/browser-env/url-context.ts` are two independent copies of the
  // same RFC 3986 formula. The shared/dom-utils symlink graph does not
  // reach shared/browser-env, so DRY is not achievable without restructure.
  // This test pins the formula by computing the expected output inline and
  // asserting buildHref (which calls encodeFragmentInline) matches it.
  // Any drift in either implementation surfaces here as a buildHref bug.
  describe("Invariant 12: encodeFragmentInline matches the documented RFC 3986 + %23 formula", () => {
    // Reference is the local `computeExpectedFragment` (top of file) — an
    // independent re-derivation of the strict #1211 formula
    // (`encodeURI(s).replaceAll("#", "%23")`, no idempotency probe). Drift
    // between this derivation and `encodeFragmentInline` is exactly what this
    // property test is supposed to surface.
    test.prop([arbHash, fc.string({ minLength: 1, maxLength: 16 })], {
      numRuns: NUM_RUNS.thorough,
    })(
      "buildHref's fragment matches reference spec for any RFC 3986 input",
      (rawHash, path) => {
        const router = {
          buildUrl: undefined,
          buildPath: () => path,
        } as unknown as import("@real-router/core").Router;
        const stripped = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;

        const result = buildHref(router, "any", {}, undefined, rawHash);

        if (!stripped) {
          expect(result).toBe(path);

          return;
        }

        const reference = computeExpectedFragment(stripped);

        expect(result).toBe(`${path}#${reference}`);
      },
    );

    test("pin reference cases (drift sentinel for both encodeFragmentInline and encodeHashFragment)", () => {
      // These exact pairs lock the formula across both implementations. If
      // anyone changes the encoder anywhere (dom-utils or browser-env), one
      // of these explicit cases will trip — surfacing the drift loudly.
      const cases: readonly [string, string][] = [
        ["section", "section"],
        ["tab=1&q=x", "tab=1&q=x"], // sub-delims preserved by encodeURI
        ["a#b#c", "a%23b%23c"], // defensive %23 replacement
        ["foo bar", "foo%20bar"], // space encoded
        ["用户", "%E7%94%A8%E6%88%B7"], // BMP CJK
        ["über", "%C3%BCber"], // BMP Latin extended
      ];

      const router = {
        buildUrl: undefined,
        buildPath: () => "/p",
      } as unknown as import("@real-router/core").Router;

      for (const [input, expected] of cases) {
        const result = buildHref(router, "any", {}, undefined, input);

        expect(result).toBe(`/p#${expected}`);
      }
    });
  });
});
