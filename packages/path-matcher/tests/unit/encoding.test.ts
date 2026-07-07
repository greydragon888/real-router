import { describe, expect, it } from "vitest";

import {
  DECODING_METHODS,
  encodeParam,
  ENCODING_METHODS,
  encodeURIComponentExcludingSubDelims,
} from "../../src/encoding";

describe("encodeURIComponentExcludingSubDelims", () => {
  it("should return safe strings unchanged", () => {
    expect(encodeURIComponentExcludingSubDelims("hello")).toBe("hello");
  });

  it("should encode characters that need encoding", () => {
    expect(encodeURIComponentExcludingSubDelims("hello world")).toBe(
      "hello%20world",
    );
  });

  it("should preserve sub-delimiters", () => {
    expect(encodeURIComponentExcludingSubDelims("a+b:c,d")).toBe("a+b:c,d");
  });

  // The full default-mode passthrough contract, asserted against a hand-written
  // literal (independent oracle — NOT derived from the encoder's own
  // NEEDS_ENCODING regex). Every char here is RFC 3986 unreserved
  // (`A-Za-z0-9-._~`) or a sub-delimiter the "default" mode intentionally
  // preserves (`!$'()*+,:;|`). Several of them (`$+,:;|`) ARE escaped by raw
  // `encodeURIComponent`, so this would fail if any dropped out of the safe set.
  it("should leave the entire unreserved + preserved-subdelim set unchanged", () => {
    const preserved = "azAZ09_-.~!$'()*+,:;|";

    expect(encodeURIComponentExcludingSubDelims(preserved)).toBe(preserved);
  });

  it("should encode unicode characters", () => {
    expect(encodeURIComponentExcludingSubDelims("日本")).toBe(
      "%E6%97%A5%E6%9C%AC",
    );
  });

  it("should encode a PAIRED surrogate (emoji) normally", () => {
    // The `u` flag coalesces the pair into one code point encodeURIComponent accepts.
    expect(encodeURIComponentExcludingSubDelims("🎉")).toBe("%F0%9F%8E%89");
    expect(encodeURIComponentExcludingSubDelims("😀")).toBe("%F0%9F%98%80");
  });

  it("should sanitize a LONE surrogate to U+FFFD instead of throwing (#1315)", () => {
    // An unpaired surrogate throws URIError in encodeURIComponent; the slow path
    // catches it and re-encodes the toWellFormed replacement (U+FFFD → %EF%BF%BD).
    expect(encodeURIComponentExcludingSubDelims("\uD800")).toBe("%EF%BF%BD");
    expect(encodeURIComponentExcludingSubDelims("a\uD800b")).toBe(
      "a%EF%BF%BDb",
    );
  });

  it("should encode @ and = signs", () => {
    expect(encodeURIComponentExcludingSubDelims("user@host")).toBe(
      "user%40host",
    );
    expect(encodeURIComponentExcludingSubDelims("a=b")).toBe("a%3Db");
  });
});

describe("ENCODING_METHODS", () => {
  it("should have all four encoding types", () => {
    expect(ENCODING_METHODS).toHaveProperty("default");
    expect(ENCODING_METHODS).toHaveProperty("uri");
    expect(ENCODING_METHODS).toHaveProperty("uriComponent");
    expect(ENCODING_METHODS).toHaveProperty("none");
  });

  it("none encoder should return value unchanged", () => {
    expect(ENCODING_METHODS.none("hello world")).toBe("hello world");
    expect(ENCODING_METHODS.none("日本")).toBe("日本");
  });

  it("all throwing modes sanitize a lone surrogate to U+FFFD — buildPath stays total (#1315)", () => {
    for (const mode of ["default", "uri", "uriComponent"] as const) {
      expect(() => ENCODING_METHODS[mode]("\uD800")).not.toThrow();
      expect(ENCODING_METHODS[mode]("\uD800")).toBe("%EF%BF%BD");
    }

    // `none` passes through (no encoding), so it never throws either.
    expect(ENCODING_METHODS.none("\uD800")).toBe("\uD800");
  });
});

describe("DECODING_METHODS", () => {
  it("should have all four decoding types", () => {
    expect(DECODING_METHODS).toHaveProperty("default");
    expect(DECODING_METHODS).toHaveProperty("uri");
    expect(DECODING_METHODS).toHaveProperty("uriComponent");
    expect(DECODING_METHODS).toHaveProperty("none");
  });

  it("none decoder should return value unchanged", () => {
    expect(DECODING_METHODS.none("%E6%97%A5%E6%9C%AC")).toBe(
      "%E6%97%A5%E6%9C%AC",
    );
  });
});

describe("encodeParam", () => {
  it("should encode non-splat param with default encoding", () => {
    expect(encodeParam("hello world", "default", false)).toBe("hello%20world");
  });

  it("should encode non-splat param with uriComponent encoding", () => {
    expect(encodeParam("hello world", "uriComponent", false)).toBe(
      "hello%20world",
    );
  });

  it("should encode non-splat param with uri encoding", () => {
    expect(encodeParam("hello world", "uri", false)).toBe("hello%20world");
  });

  it("should not encode non-splat param with none encoding", () => {
    expect(encodeParam("hello world", "none", false)).toBe("hello world");
  });

  it("should coerce number to string", () => {
    expect(encodeParam(123, "default", false)).toBe("123");
  });

  it("should coerce boolean to string", () => {
    expect(encodeParam(true, "default", false)).toBe("true");
  });

  it("should encode splat param preserving / separators", () => {
    expect(encodeParam("docs/readme.md", "default", true)).toBe(
      "docs/readme.md",
    );
  });

  it("should encode splat param segments individually", () => {
    expect(encodeParam("path/hello world/end", "default", true)).toBe(
      "path/hello%20world/end",
    );
  });

  it("should handle splat param with single segment", () => {
    expect(encodeParam("single", "default", true)).toBe("single");
  });

  it("should handle splat param with none encoding", () => {
    expect(encodeParam("a/b c/d", "none", true)).toBe("a/b c/d");
  });

  // A non-splat param must encode "/" (it is a value char, not a separator).
  // This distinguishes the `!isSpatParam` fast path from the splat branch:
  // the splat branch splits on "/" and would preserve the separators.
  it("should encode '/' in a non-splat param", () => {
    expect(encodeParam("a/b", "default", false)).toBe("a%2Fb");
    expect(encodeParam("a/b", "uriComponent", false)).toBe("a%2Fb");
  });

  it("sanitizes a lone surrogate on the public buildPath path (#1315)", () => {
    expect(encodeParam("\uD800", "default", false)).toBe("%EF%BF%BD");
    // Splat: each `/`-segment is encoded independently, so each is sanitized.
    expect(encodeParam("a/\uD800", "default", true)).toBe("a/%EF%BF%BD");
    // A PAIRED surrogate (emoji) is unaffected.
    expect(encodeParam("🎉", "default", false)).toBe("%F0%9F%8E%89");
  });
});
