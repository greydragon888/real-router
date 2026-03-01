import { describe, expect, it } from "vitest";

import {
  DECODING_METHODS,
  encodeParam,
  ENCODING_METHODS,
  encodeURIComponentExcludingSubDelims,
} from "../../src";

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

  it("should encode unicode characters", () => {
    expect(encodeURIComponentExcludingSubDelims("日本")).toBe(
      "%E6%97%A5%E6%9C%AC",
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
});
