// packages/angular/tests/property/buildHref.properties.ts

/**
 * Property-based tests for `buildHref` from `packages/angular/src/dom-utils/`
 * (git-tracked copy of `shared/dom-utils/link-utils.ts`).
 *
 * Closes review-2026-05-10 §6.2 invariants 3 (idempotency on `#` prefix) and
 * 4 (hash append correctness). The full surface mirrors svelte's coverage so
 * the two adapters cannot drift unnoticed.
 *
 * Invariants verified:
 * 1. Falls back to buildPath when buildUrl returns undefined
 * 2. Prefers buildUrl when defined and returns a string
 * 3. Idempotence — same args produce the same result
 * 4. Invalid routeName → undefined + console.error
 * 5. Hash encoding — RFC 3986 + defensive %23 for `#`
 * 6. Leading `#` is stripped (Invariant 3 from §6.2)
 * 7. buildUrl receives `{ hash }` object, never `{ hash: undefined }`
 * 8. Route names with digits / dashes / underscores pass through verbatim
 * 9. buildPath alone throws → undefined + console.error
 * 10. Non-string params (BigInt, Symbol, Date) pass through verbatim
 * 11. Long routeName + Unicode pass through verbatim
 * 12. encodeFragmentInline matches RFC 3986 + %23 formula (drift sentinel)
 */

import { fc, test } from "@fast-check/vitest";
import { describe, expect, vi } from "vitest";

import { NUM_RUNS, arbDottedNameExtended, arbHash } from "./helpers";
import { buildHref } from "../../src/dom-utils";
// Imported directly from `shared/` because Angular's `sync-dom-utils.mjs`
// strips `__`-prefixed test-helper dirs from its `src/dom-utils/` copy
// (ng-packagr would otherwise bundle them into the lib output).

import type { Params, Router } from "@real-router/core";

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
  describe("Invariant 1: Falls back to buildPath when buildUrl returns undefined", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 16 })], {
      numRuns: NUM_RUNS.standard,
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
      { numRuns: NUM_RUNS.standard },
    )("returns buildUrl result, not buildPath", (url, path) => {
      const router = makeFakeRouter(
        () => url,
        () => path,
      );

      expect(buildHref(router, "any", {})).toBe(url);
    });
  });

  describe("Invariant 3: Idempotence — same args produce the same result", () => {
    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 16 }),
      ],
      { numRuns: NUM_RUNS.standard },
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
      { numRuns: NUM_RUNS.standard },
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
      numRuns: NUM_RUNS.standard,
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

  // Invariant 4 from review §6.2 — buildPath fallback appends an encoded hash.
  // `encodeURI` preserves sub-delims (`&=?:`) but does NOT touch `#`; the
  // defensive `.replaceAll("#", "%23")` is the only thing keeping `a#b` from
  // landing in the URL as a second fragment delimiter.
  describe("Invariant 5: Hash encoding (RFC 3986 + defensive %23 for #)", () => {
    test.prop([arbHash, fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.extensive,
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

      const fragment = href!.slice(`${path}#`.length);

      expect(fragment).not.toContain("#");
    });
  });

  // Invariant 3 from review §6.2 — `<a realLink hash="#section">` and
  // `<a realLink hash="section">` must produce the same href.
  describe("Invariant 6: Leading `#` is stripped before encoding/forwarding", () => {
    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.string({ minLength: 1, maxLength: 12 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )("hash='#x' and hash='x' produce identical href", (rawHash, path) => {
      fc.pre(!rawHash.startsWith("#"));

      const router = makeFakeRouter(undefined, () => path);

      const withHash = buildHref(router, "any", {}, undefined, `#${rawHash}`);
      const withoutHash = buildHref(router, "any", {}, undefined, rawHash);

      expect(withHash).toBe(withoutHash);
    });
  });

  describe("Invariant 7: buildUrl receives { hash } object, not { hash: undefined }", () => {
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
  });

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
        } as unknown as Router;

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
        } as unknown as Router;

        buildHref(router, routeName, {});

        expect(namesPassed).toStrictEqual([routeName]);
      },
    );
  });

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

  describe("Invariant 10: Non-string routeParams (BigInt, Symbol, Date) pass through verbatim", () => {
    test("BigInt param → forwarded by reference", () => {
      const calls: { params: unknown }[] = [];
      const router = {
        buildUrl: (_name: string, params: object) => {
          calls.push({ params });

          return "/url";
        },
        buildPath: () => "/path",
      } as unknown as Router;

      const params = { id: 12_345n } as unknown as Params;

      buildHref(router, "test", params);

      expect(calls).toHaveLength(1);
      expect(calls[0].params).toBe(params);
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
      } as unknown as Router;

      const params = { token: sym } as unknown as Params;

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
      } as unknown as Router;

      const params = { at: date } as unknown as Params;

      buildHref(router, "test", params);

      expect(calls).toHaveLength(1);
      expect((calls[0].params as { at: Date }).at).toBe(date);
    });

    test("router that JSON.stringify's params with BigInt → TypeError → undefined + console.error", () => {
      const router = {
        buildUrl: undefined,
        buildPath: (_name: string, params: object) => {
          JSON.stringify(params);

          return "/path";
        },
      } as unknown as Router;
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = buildHref(router, "test", {
        id: 12_345n,
      } as unknown as Params);

      expect(result).toBeUndefined();
      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[real-router] Route "test" is not defined`),
      );

      errSpy.mockRestore();
    });
  });

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
      } as unknown as Router;

      buildHref(router, longName, {});

      expect(namesPassed).toStrictEqual([longName]);
      expect(namesPassed[0]).toHaveLength(1024);
    });

    test("Unicode routeName (BMP letters + emoji) → forwarded verbatim", () => {
      const unicodeName = "пользователь.profile.用户";
      const emojiName = "page-🎉";
      const namesPassed: string[] = [];
      const router = {
        buildUrl: undefined,
        buildPath: (name: string) => {
          namesPassed.push(name);

          return "/p";
        },
      } as unknown as Router;

      buildHref(router, unicodeName, {});
      buildHref(router, emojiName, {});

      expect(namesPassed).toStrictEqual([unicodeName, emojiName]);
    });
  });

  // The Angular adapter holds a git-tracked copy of `link-utils.ts`. The
  // identical `encodeFragmentInline` formula also lives in
  // `shared/browser-env/url-context.ts` (`encodeHashFragment`). Three copies
  // must stay aligned; this drift sentinel pins the documented formula.
  describe("Invariant 12: encodeFragmentInline matches the documented RFC 3986 + %23 formula", () => {
    test.prop([arbHash, fc.string({ minLength: 1, maxLength: 16 })], {
      numRuns: NUM_RUNS.thorough,
    })(
      "buildHref's fragment matches reference spec for any RFC 3986 input",
      (rawHash, path) => {
        const router = {
          buildUrl: undefined,
          buildPath: () => path,
        } as unknown as Router;
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

    test("pin reference cases (drift sentinel)", () => {
      const cases: readonly [string, string][] = [
        ["section", "section"],
        ["tab=1&q=x", "tab=1&q=x"],
        ["a#b#c", "a%23b%23c"],
        ["foo bar", "foo%20bar"],
        ["用户", "%E7%94%A8%E6%88%B7"],
        ["über", "%C3%BCber"],
      ];

      const router = {
        buildUrl: undefined,
        buildPath: () => "/p",
      } as unknown as Router;

      for (const [input, expected] of cases) {
        const result = buildHref(router, "any", {}, undefined, input);

        expect(result).toBe(`/p#${expected}`);
      }
    });
  });

  // Closes review-2026-05-10 §5.1 ⛔ ("routeParams с Object.create(null) /
  // Symbol-key" LOW). Inv 10 above covers non-string VALUE types (BigInt,
  // Symbol, Date as values); this block covers the dual case — params with
  // a null prototype or Symbol-keyed entries. The helper forwards `params`
  // by reference to `buildUrl` / `buildPath` without prototype-walks or
  // Object.keys enumeration, so both cases pass through transparently.
  describe("Invariant 13: routeParams with null prototype / Symbol keys pass through verbatim", () => {
    test("Object.create(null) params → forwarded by reference (no prototype expected)", () => {
      const params = Object.create(null) as Record<string, string>;

      params.id = "42";
      const calls: { params: unknown }[] = [];
      const router = {
        buildUrl: (_name: string, p: object) => {
          calls.push({ params: p });

          return "/url";
        },
        buildPath: () => "/path",
      } as unknown as Router;

      buildHref(router, "test", params);

      expect(calls).toHaveLength(1);
      expect(calls[0].params).toBe(params);
      expect(Object.getPrototypeOf(calls[0].params)).toBeNull();
    });

    test("Symbol-keyed params → forwarded by reference (router-layer may ignore symbol keys)", () => {
      const sym = Symbol("test");
      const params = { id: "1", [sym]: "ignored" } as unknown as Record<
        string,
        string
      >;
      const calls: { params: unknown }[] = [];
      const router = {
        buildUrl: (_name: string, p: object) => {
          calls.push({ params: p });

          return "/url";
        },
        buildPath: () => "/path",
      } as unknown as Router;

      buildHref(router, "test", params);

      expect(calls).toHaveLength(1);
      // Same ref, Symbol property still present on the object — buildHref
      // is content-agnostic; router decides what to do with extra keys.
      expect(calls[0].params).toBe(params);
      expect((calls[0].params as Record<string | symbol, unknown>)[sym]).toBe(
        "ignored",
      );
    });
  });

  // Closes review-2026-05-10 §5.1 ⛔ ("hash control-chars / surrogate pairs
  // / lone surrogate" LOW). `encodeURI` throws `URIError` on a LONE
  // surrogate (high or low half without its pair). The helper's outer
  // try/catch must swallow this and fall through to the documented
  // "Route is not defined" path (undefined return + console.error).
  describe("Invariant 14: lone-surrogate hash → undefined + console.error (URIError caught)", () => {
    test("lone high surrogate → URIError caught, returns undefined + logs", () => {
      const router = {
        buildUrl: undefined,
        buildPath: () => "/p",
      } as unknown as Router;
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // U+D800 is a high surrogate WITHOUT its low-surrogate pair.
      // encodeURI(loneSurrogate) throws URIError; the helper's try/catch
      // converts that into the standard "route not defined" diagnostics
      // path (returns undefined + emits one console.error).
      const result = buildHref(router, "any", {}, undefined, "\uD800");

      expect(result).toBeUndefined();
      expect(errSpy).toHaveBeenCalledTimes(1);
      expect(errSpy).toHaveBeenCalledWith(
        expect.stringContaining('[real-router] Route "any" is not defined'),
      );

      errSpy.mockRestore();
    });

    test("lone low surrogate → same defensive behavior", () => {
      const router = {
        buildUrl: undefined,
        buildPath: () => "/p",
      } as unknown as Router;
      const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // U+DFFF is a low surrogate without its high pair.
      const result = buildHref(router, "any", {}, undefined, "\uDFFF");

      expect(result).toBeUndefined();
      expect(errSpy).toHaveBeenCalledTimes(1);

      errSpy.mockRestore();
    });

    test("control chars (U+0000-U+001F) → encoded normally by encodeURI", () => {
      const router = {
        buildUrl: undefined,
        buildPath: () => "/p",
      } as unknown as Router;

      // encodeURI percent-encodes control chars; no throw, no fallback.
      const result = buildHref(router, "any", {}, undefined, "a\u0000b\u001Fc");

      expect(result).toBe("/p#a%00b%1Fc");
    });

    test("valid surrogate pair (emoji U+1F389 🎉) → encodes correctly", () => {
      const router = {
        buildUrl: undefined,
        buildPath: () => "/p",
      } as unknown as Router;

      const result = buildHref(router, "any", {}, undefined, "🎉");

      expect(result).toBe("/p#%F0%9F%8E%89");
    });
  });

  // ===========================================================================
  // #1211 (decision D1 = strictly-decoded) — `encodeFragmentInline` is the
  // trivial `encodeURI(s).replaceAll("#", "%23")` and is therefore NOT
  // idempotent for pre-encoded inputs: a literal `%` is escaped to `%25`, so
  // feeding a wire fragment back double-encodes (`%20` → `%2520`). This
  // overturns Mini-sprint E.1's probe-round-trip tolerance (audit-2026-05-17
  // §5) in favour of a single, byte-identical encode across the plugin and
  // adapter layers. `hash` is a DECODED fragment; that is the contract.
  // ===========================================================================
  describe("Invariant 13: encodeFragmentInline is NOT idempotent — decoded-input contract (#1211, overturns Mini-sprint E.1)", () => {
    // The `hash` value is a DECODED fragment, encoded verbatim by
    // `encodeURI(s).replaceAll("#", "%23")`. Feeding the helper's own wire
    // output back in as a hash re-escapes the literal `%` to `%25`, so the
    // second pass is strictly NOT equal to the first — the correct, lossless
    // consequence of the decoded-input contract, not a regression.
    test.prop([fc.constantFrom("a#b", "a%20b", "%FF", "%25foo", "ab#cd%ef")], {
      numRuns: NUM_RUNS.standard,
    })(
      "wire fragment fed back double-encodes — helper is NOT idempotent",
      (rawHash) => {
        const router = {
          buildUrl: undefined,
          buildPath: () => "/p",
        } as unknown as Router;

        const once = buildHref(router, "any", {}, undefined, rawHash);

        fc.pre(once !== undefined);

        // `once` is the verbatim encode of the DECODED input — the canonical
        // strict formula, no decode, no round-trip.
        expect(once).toBe(`/p#${encodeURI(rawHash).replaceAll("#", "%23")}`);

        // Feed the WIRE fragment back in as a decoded hash. The literal `%`
        // introduced by the first encode is re-escaped to `%25`, so the
        // second pass is strictly NOT equal to the first.
        const onceFragment = once.slice(once.indexOf("#") + 1);
        const twice = buildHref(router, "any", {}, undefined, onceFragment);

        expect(twice).not.toBe(once);
      },
    );
  });

  // ===========================================================================
  // Audit 2026-05-16 §2.1 / §2.2 — path verbatim contract (Unicode + embedded
  // chars). `buildHref` is content-agnostic for the path: it concatenates
  // verbatim with `${path}#${encodedHash}`. Unicode codepoints, control
  // characters, and already-embedded `#`/`?` in the path must pass through
  // unchanged — the helper does not sanitize the router's output. A future
  // refactor that "cleaned up" the path would silently break Unicode-routed
  // pages and apps that already render fragments inside the path string.
  // ===========================================================================
  describe("Invariant 15: path is forwarded verbatim — Unicode + control chars + embedded `#`/`?` survive (audit §2.1/§2.2)", () => {
    // fast-check v4 dropped the dedicated `fullUnicodeString` arbitrary; the
    // `constantFrom` band is curated to cover every script class that matters
    // for verbatim-passthrough verification (CJK, RTL, astral plane,
    // zero-width controls, ASCII C0 controls).
    const arbUnicodeyPath: fc.Arbitrary<string> = fc.oneof(
      fc.string({ minLength: 1, maxLength: 16 }),
      fc.constantFrom(
        "/用户/42",
        "/über",
        "/한국어",
        "/אבג",
        "/مرحبا",
        "/p\u0000q", // embedded NUL (C0 control)
        "/p\u0001q", // SOH (C0 control)
        "/p\u001Fq", // unit separator (C0 control)
        "/p\u200Bq", // zero-width space
        "/p\u202Eq", // RTL override
        "/p\u{1F389}q", // astral plane (\ud83c\udf89)
      ),
    );

    test.prop([arbUnicodeyPath], { numRuns: NUM_RUNS.standard })(
      "buildPath result is concatenated verbatim into the href (no sanitization)",
      (path) => {
        const router = {
          buildUrl: undefined,
          buildPath: () => path,
        } as unknown as Router;

        // No hash → result is exactly the path the router returned.
        expect(buildHref(router, "any", {})).toBe(path);
      },
    );

    test.prop([arbUnicodeyPath, arbHash], { numRuns: NUM_RUNS.standard })(
      "Unicode path + hash → `${path}#${encodedHash}`; path bytes are unchanged",
      (path, rawHash) => {
        const router = {
          buildUrl: undefined,
          buildPath: () => path,
        } as unknown as Router;
        const result = buildHref(router, "any", {}, undefined, rawHash);
        const stripped = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;

        if (!stripped) {
          expect(result).toBe(path);

          return;
        }

        // The path prefix is byte-equal to `path` regardless of Unicode content.
        expect(result).toBeDefined();
        expect(result!.startsWith(path)).toBe(true);
        // After the path comes a SINGLE delimiter `#`, then the encoded hash.
        expect(result![path.length]).toBe("#");
      },
    );

    test.prop(
      [
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.string({ minLength: 1, maxLength: 8 }),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "path with an already-embedded `#` is NOT sanitised; the resulting href contains two `#` (caller-owned hazard)",
      (prefix, suffix) => {
        fc.pre(!prefix.includes("#"));
        fc.pre(!suffix.includes("#"));

        const pathWithHash = `/${prefix}#${suffix}`;
        const router = {
          buildUrl: undefined,
          buildPath: () => pathWithHash,
        } as unknown as Router;
        const result = buildHref(router, "any", {}, undefined, "extra");

        // The path's embedded `#` and the buildHref `#extra` delimiter both
        // survive — buildHref appends, it does not parse the path.
        expect(result).toBe(`${pathWithHash}#extra`);

        // Two `#` characters in the final href: caller-owned hazard.
        expect(result!.match(/#/g) ?? []).toHaveLength(2);
      },
    );

    test("path with embedded `?` and `#` is forwarded verbatim with no escaping", () => {
      const path = "/a?q=1#frag";
      const router = {
        buildUrl: undefined,
        buildPath: () => path,
      } as unknown as Router;

      expect(buildHref(router, "any", {})).toBe(path);

      const withHash = buildHref(router, "any", {}, undefined, "more");

      // Same as above: `#more` appended to a path that already contains `#frag`.
      expect(withHash).toBe(`${path}#more`);
    });
  });

  // ===========================================================================
  // Audit 2026-05-16 §6.2 #8 (MED) — params non-mutation
  // ===========================================================================
  describe("Invariant 14: buildHref does not mutate the params argument (audit §6.2 #8)", () => {
    function snapshotEntries(o: Record<string, unknown>): [string, unknown][] {
      return Object.keys(o)
        .toSorted((a, b) => a.localeCompare(b))
        .map((k) => [k, o[k]] as [string, unknown]);
    }

    test.prop(
      [
        fc.dictionary(
          fc.stringMatching(/^[a-z]{1,4}$/),
          fc.oneof(
            fc.string({ maxLength: 8 }),
            fc.integer({ min: -100, max: 100 }),
            fc.boolean(),
          ),
          { minKeys: 0, maxKeys: 4 },
        ),
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "params snapshot before equals snapshot after for buildPath-only routers",
      (params) => {
        const router = {
          buildUrl: undefined,
          buildPath: () => "/p",
        } as unknown as Router;
        // structuredClone refuses null-prototype records (fast-check may shrink
        // to `{__proto__: null}`); compare by own-entries snapshot instead.
        const before = snapshotEntries(params);

        buildHref(router, "any", params);

        expect(
          snapshotEntries(params as Record<string, unknown>),
        ).toStrictEqual(before);
      },
    );

    test.prop(
      [
        fc.dictionary(
          fc.stringMatching(/^[a-z]{1,4}$/),
          fc.oneof(
            fc.string({ maxLength: 8 }),
            fc.integer({ min: -100, max: 100 }),
            fc.boolean(),
          ),
          { minKeys: 0, maxKeys: 4 },
        ),
        arbHash,
      ],
      { numRuns: NUM_RUNS.standard },
    )(
      "params snapshot before equals snapshot after even when hash is provided",
      (params, hash) => {
        const router = {
          buildUrl: undefined,
          buildPath: () => "/p",
        } as unknown as Router;
        const before = snapshotEntries(params);

        buildHref(router, "any", params, undefined, hash);

        expect(
          snapshotEntries(params as Record<string, unknown>),
        ).toStrictEqual(before);
      },
    );
  });

  // ===========================================================================
  // Audit 2026-05-16 §5.2 Bug 1 (LOW) — routeName containing `#` / `?` is
  // forwarded verbatim into the href without encoding. In production the
  // route-tree layer (route-utils `SAFE_SEGMENT_PATTERN`) rejects such
  // routeNames before they reach buildHref. The pin below documents that
  // buildHref itself is content-agnostic: it trusts router.buildPath /
  // router.buildUrl to have already validated the name.
  // ===========================================================================
  describe("Invariant 16: routeName with `#`/`?` is forwarded verbatim (Bug 1 pin — defense lives in route-tree)", () => {
    test("router.buildPath returning `/a#b` is concatenated verbatim into href", () => {
      const router = {
        buildUrl: undefined,
        buildPath: (name: string) => `/${name}`,
      } as unknown as Router;
      // Caller passes a routeName that *would* normally be rejected by
      // route-utils — buildHref does NOT re-validate.
      const result = buildHref(router, "a#b", {});

      expect(result).toBe("/a#b");
    });

    test("router.buildPath returning `/a?q=1` is concatenated verbatim into href", () => {
      const router = {
        buildUrl: undefined,
        buildPath: (name: string) => `/${name}`,
      } as unknown as Router;
      const result = buildHref(router, "a?q=1", {});

      expect(result).toBe("/a?q=1");
    });
  });

  // ===========================================================================
  // #1211 (decision D1 = strictly-decoded) — `encodeFragmentInline` runs the
  // trivial `encodeURI(s).replaceAll("#", "%23")`: every literal `%` in the
  // DECODED input is escaped to `%25`. `<Link hash="a%20b">` therefore emits
  // wire `a%2520b` (the literal fragment `a%20b`), overturning Mini-sprint
  // E.1's pre-encoded tolerance. No `decodeURIComponent` probe, no round-trip.
  // ===========================================================================
  describe("Invariant 17: encodeFragmentInline escapes every literal `%` — decoded-input contract (#1211, overturns Mini-sprint E.1)", () => {
    test("hash='a%20b' is a literal fragment → verbatim wire 'a%2520b'", () => {
      const router = {
        buildUrl: undefined,
        buildPath: () => "/p",
      } as unknown as Router;
      const result = buildHref(router, "any", {}, undefined, "a%20b");

      // Decoded-input contract: the literal `%` is escaped to `%25`.
      expect(result).toBe("/p#a%2520b");
    });

    test("hash='%FF' → '%25FF' (literal `%` escaped, `FF` untouched)", () => {
      // No probe / decodeURIComponent under the strict contract:
      // `encodeURI("%FF")` escapes the literal `%` to `%25` and leaves
      // the `FF` literals, giving `%25FF`.
      const router = {
        buildUrl: undefined,
        buildPath: () => "/p",
      } as unknown as Router;
      const result = buildHref(router, "any", {}, undefined, "%FF");

      expect(result).toBe("/p#%25FF");
    });

    test("hash='%xy' → '%25xy' (literal `%` escaped)", () => {
      // Plain `encodeURI("%xy")` escapes the literal `%` to `%25`; the
      // `xy` are unreserved and pass through. Result: `%25xy`.
      const router = {
        buildUrl: undefined,
        buildPath: () => "/p",
      } as unknown as Router;
      const result = buildHref(router, "any", {}, undefined, "%xy");

      expect(result).toBe("/p#%25xy");
    });
  });
});
