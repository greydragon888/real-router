import { describe, expect, it } from "vitest";

import { createMatcher } from "../../helpers/buildTree";

import type { URLParamsEncodingType } from "../../../src/path-matcher";

/**
 * PUBLIC-CONTRACT tests for URL-param encoding/decoding.
 *
 * The encoders (`encodeParam` / `ENCODING_METHODS`) ARE what `buildPath` runs on a
 * param value, and the decoders (`DECODING_METHODS`) ARE what `match` runs — so these
 * exercise them through the surface a consumer observes: `buildPath` for encoding,
 * `match` for decoding, each under a matcher configured for the target mode. Every
 * assertion is a real guarantee about a built/matched URL, not an internal shape.
 */

// buildPath("/:p", { p: value }) => "/" + encode(value); slice off the leading "/".
const enc = (value: unknown, mode: URLParamsEncodingType = "default"): string =>
  createMatcher([{ name: "r", path: "/:p" }], { urlParamsEncoding: mode })
    .buildPath("r", { p: value })
    .slice(1);

// splat encodes each "/"-segment individually, preserving the separators.
const encSplat = (
  value: string,
  mode: URLParamsEncodingType = "default",
): string =>
  createMatcher([{ name: "r", path: "/*p" }], { urlParamsEncoding: mode })
    .buildPath("r", { p: value })
    .slice(1);

// match("/" + encoded) decodes the single param value under the mode's decoder.
const dec = (
  encoded: string,
  mode: URLParamsEncodingType = "default",
): string | undefined =>
  createMatcher([{ name: "r", path: "/:p" }], {
    urlParamsEncoding: mode,
  }).match(`/${encoded}`)?.params.p as string | undefined;

describe("default-mode encoding via buildPath (sub-delimiter-preserving)", () => {
  it("leaves an all-safe value unchanged (fast path)", () => {
    expect(enc("hello")).toBe("hello");
  });

  it("encodes a char that needs it (slow path)", () => {
    expect(enc("hello world")).toBe("hello%20world");
  });

  it("preserves the full unreserved + sub-delimiter set", () => {
    // RFC 3986 unreserved (A-Za-z0-9-._~) + the sub-delims "default" keeps
    // (!$'()*+,:;|); several ($+,:;|) ARE escaped by raw encodeURIComponent, so
    // this fails if any dropped out of the safe set.
    const preserved = "azAZ09_-.~!$'()*+,:;|";

    expect(enc(preserved)).toBe(preserved);
  });

  it("encodes '@' and '='", () => {
    expect(enc("user@host")).toBe("user%40host");
    expect(enc("a=b")).toBe("a%3Db");
  });

  it("encodes unicode and a PAIRED surrogate (emoji)", () => {
    expect(enc("日本")).toBe("%E6%97%A5%E6%9C%AC");
    expect(enc("🎉")).toBe("%F0%9F%8E%89");
  });

  it("sanitizes a LONE surrogate to U+FFFD instead of throwing (#1315) — buildPath stays total", () => {
    expect(() => enc("\uD800")).not.toThrow();
    expect(enc("\uD800")).toBe("%EF%BF%BD");
    expect(enc("a\uD800b")).toBe("a%EF%BF%BDb");
  });

  it("a NON-splat param encodes '/' (a value char, not a separator)", () => {
    expect(enc("a/b")).toBe("a%2Fb");
    expect(enc("a/b", "uriComponent")).toBe("a%2Fb");
  });

  it("coerces a non-string param value to a string", () => {
    expect(enc(123)).toBe("123");
    expect(enc(true)).toBe("true");
  });
});

describe("encoding modes via buildPath", () => {
  it("uri / uriComponent encode a space", () => {
    expect(enc("hello world", "uri")).toBe("hello%20world");
    expect(enc("hello world", "uriComponent")).toBe("hello%20world");
  });

  it("none passes the value through unchanged (incl. a lone surrogate — never throws)", () => {
    expect(enc("hello world", "none")).toBe("hello world");
    expect(enc("日本", "none")).toBe("日本");
    expect(enc("\uD800", "none")).toBe("\uD800");
  });

  it("every throwing mode sanitizes a lone surrogate (#1315)", () => {
    for (const mode of ["default", "uri", "uriComponent"] as const) {
      expect(() => enc("\uD800", mode)).not.toThrow();
      expect(enc("\uD800", mode)).toBe("%EF%BF%BD");
    }
  });
});

describe("splat encoding via buildPath (per-segment, preserving '/')", () => {
  it("preserves '/' separators, encoding each segment individually", () => {
    expect(encSplat("docs/readme.md")).toBe("docs/readme.md");
    expect(encSplat("path/hello world/end")).toBe("path/hello%20world/end");
  });

  it("handles a single segment", () => {
    expect(encSplat("single")).toBe("single");
  });

  it("sanitizes a lone surrogate PER segment (#1315)", () => {
    expect(encSplat("a/\uD800")).toBe("a/%EF%BF%BD");
  });

  it("none mode passes a multi-segment value through unchanged", () => {
    expect(encSplat("a/b c/d", "none")).toBe("a/b c/d");
  });
});

describe("decoding via match", () => {
  it("default / uri / uriComponent decode a percent-escape", () => {
    expect(dec("%20")).toBe(" ");
    expect(dec("%20", "uri")).toBe(" ");
    expect(dec("%20", "uriComponent")).toBe(" ");
  });

  it("none leaves the raw value undecoded", () => {
    expect(dec("%E6%97%A5%E6%9C%AC", "none")).toBe("%E6%97%A5%E6%9C%AC");
  });

  it("round-trips through buildPath ∘ match", () => {
    expect(dec(enc("hello world"))).toBe("hello world");
    expect(dec(enc("a=b"))).toBe("a=b");
  });
});
