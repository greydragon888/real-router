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

import type { Params, Router } from "@real-router/core";

function makeFakeRouter(
  buildUrl:
    | ((
        name: string,
        params: object,
        options?: { hash?: string },
      ) => string | undefined)
    | undefined,
  buildPath: (name: string, params: object) => string,
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
        const a = buildHref(router, name, {}, { hash });
        const b = buildHref(router, name, {}, { hash });

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
      numRuns: NUM_RUNS.thorough,
    })("fallback path → hash is encodeURI'd and # → %23", (rawHash, path) => {
      const router = makeFakeRouter(undefined, () => path);
      const href = buildHref(router, "any", {}, { hash: rawHash });

      const stripped = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;

      if (!stripped) {
        expect(href).toBe(path);

        return;
      }

      const expectedHash = encodeURI(stripped).replaceAll("#", "%23");

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

      const withHash = buildHref(router, "any", {}, { hash: `#${rawHash}` });
      const withoutHash = buildHref(router, "any", {}, { hash: rawHash });

      expect(withHash).toBe(withoutHash);
    });
  });

  describe("Invariant 7: buildUrl receives { hash } object, not { hash: undefined }", () => {
    test.prop([fc.string({ minLength: 1, maxLength: 12 })], {
      numRuns: NUM_RUNS.standard,
    })("no-hash call → buildUrl receives options=undefined", (name) => {
      const calls: { options: unknown }[] = [];
      const router = makeFakeRouter(
        (_n, _p, options) => {
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
          (_n, _p, options) => {
            calls.push({ options });

            return "/url";
          },
          () => "/path",
        );

        buildHref(router, name, {}, { hash: rawHash });

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
    function referenceEncodeFragment(decoded: string): string {
      return encodeURI(decoded).replaceAll("#", "%23");
    }

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

        const result = buildHref(router, "any", {}, { hash: rawHash });

        if (!stripped) {
          expect(result).toBe(path);

          return;
        }

        const reference = referenceEncodeFragment(stripped);

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
        const result = buildHref(router, "any", {}, { hash: input });

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
      const result = buildHref(router, "any", {}, { hash: "\uD800" });

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
      const result = buildHref(router, "any", {}, { hash: "\uDFFF" });

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
      const result = buildHref(router, "any", {}, { hash: "a\u0000b\u001Fc" });

      expect(result).toBe("/p#a%00b%1Fc");
    });

    test("valid surrogate pair (emoji U+1F389 🎉) → encodes correctly", () => {
      const router = {
        buildUrl: undefined,
        buildPath: () => "/p",
      } as unknown as Router;

      const result = buildHref(router, "any", {}, { hash: "🎉" });

      expect(result).toBe("/p#%F0%9F%8E%89");
    });
  });
});
