import { describe, expect, it } from "vitest";

import { parseQuery } from "../../../src/search-params";

/**
 * Robustness / DoS-resistance for adversarial query strings.
 *
 * `parseQuery` runs on user-controlled URLs, so it must stay well-behaved on inputs no
 * realistic app produces but an attacker can: multi-megabyte values, hundreds of
 * thousands of params, degenerate separators, deeply bracketed names. These
 * assert that parseQuery completes without crashing and returns a correct, bounded
 * result at scale — coverage and small-input property tests never reach these
 * sizes. These are no-crash + structural-correctness guards (the "never throws on
 * adversarial input" contract plus correct, input-proportional output); there are
 * no timing assertions here — this is robustness, not throughput (the scaling
 * files own the anti-quadratic ceilings).
 *
 * The values stay non-numeric (a leading letter) so `autoNumber` short-circuits
 * on the first character rather than scanning megabytes — itself a property worth
 * pinning, since a regression that scanned the whole value would surface here.
 *
 * **No heap tests** — output size is input-proportional, not retained state.
 * **No recursion guard** — parseQuery is iterative; there is no call stack to blow.
 */

describe("very long single value", () => {
  const SIZE = 5_000_000; // 5M chars
  const value = `x${"a".repeat(SIZE)}`;
  const qs = `data=${value}`;

  it("parses a multi-megabyte value intact, kept as a string", () => {
    let parsed: Record<string, unknown> = {};

    expect(() => {
      parsed = parseQuery(qs);
    }).not.toThrow();

    // Value survives byte-for-byte and stays a string (the leading 'x' makes
    // autoNumber short-circuit on char 0 rather than scanning megabytes).
    expect(parsed.data).toBe(value);
    expect(parsed.data as string).toHaveLength(value.length);
  });
});

describe("massive param count", () => {
  const N = 100_000;
  const qs = Array.from({ length: N }, (_, i) => `k${i}=v${i}`).join("&");

  it(`parses ${N} params without crashing, all keys present`, () => {
    let parsed: Record<string, unknown> = {};

    expect(() => {
      parsed = parseQuery(qs);
    }).not.toThrow();

    expect(Object.keys(parsed)).toHaveLength(N);
    expect(parsed.k0).toBe("v0");
    expect(parsed[`k${N - 1}`]).toBe(`v${N - 1}`);
  });
});

describe("massive repeated key", () => {
  const K = 100_000;
  const qs = Array.from({ length: K }, (_, i) => `r=v${i}`).join("&");

  it(`accumulates ${K} repeats into a single array without crashing`, () => {
    let parsed: Record<string, unknown> = {};

    expect(() => {
      parsed = parseQuery(qs, { numberFormat: "none" });
    }).not.toThrow();

    expect(parsed.r).toHaveLength(K);
  });
});

describe("degenerate separators", () => {
  it("survives long runs of empty chunks and stray '=' without crashing", () => {
    const ampersands = "&".repeat(100_000);
    const equals = "=".repeat(100_000);

    expect(() => parseQuery(`a=1${ampersands}b=2`)).not.toThrow();
    expect(() => parseQuery(ampersands)).not.toThrow();
    expect(() => parseQuery(`x${equals}y`)).not.toThrow();

    // Real keys around the noise are still recovered.
    const parsed = parseQuery(`a=1${ampersands}b=2`, { numberFormat: "none" });

    expect(parsed.a).toBe("1");
    expect(parsed.b).toBe("2");
  });
});

describe("deeply bracketed parameter name", () => {
  it("handles a name with tens of thousands of bracket pairs without crashing", () => {
    const brackets = "[]".repeat(50_000);
    let parsed: Record<string, unknown> = {};

    expect(() => {
      parsed = parseQuery(`a${brackets}=v`, {
        arrayFormat: "brackets",
        numberFormat: "none",
      });
    }).not.toThrow();

    // Name extraction stops at the first '[': the param is keyed under "a".
    expect(parsed.a).toStrictEqual(["v"]);
  });
});

describe("percent-encoding heavy value", () => {
  const N = 100_000;
  // N copies of "%41" → "A"; decodeURIComponent must process the whole value.
  const qs = `code=${"%41".repeat(N)}`;

  it(`decodes ${N} percent-escapes without crashing, correct result`, () => {
    let parsed: Record<string, unknown> = {};

    expect(() => {
      parsed = parseQuery(qs, { numberFormat: "none" });
    }).not.toThrow();

    expect(parsed.code).toBe("A".repeat(N));
  });
});
