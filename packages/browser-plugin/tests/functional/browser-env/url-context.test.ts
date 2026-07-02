import { describe, it, expect } from "vitest";

import {
  encodeHashFragment,
  decodeHashFragment,
  normalizeHashInput,
  getDecodedHash,
} from "../../../src/browser-env";

describe("encodeHashFragment", () => {
  it("preserves RFC 3986 sub-delims that encodeURIComponent would escape", () => {
    expect(encodeHashFragment("a=1&b=2?c:d")).toBe("a=1&b=2?c:d");
  });

  it("percent-escapes a stray '#' so it cannot terminate the fragment", () => {
    expect(encodeHashFragment("sec#tion")).toBe("sec%23tion");
  });

  it("encodes spaces and non-ASCII via encodeURI", () => {
    expect(encodeHashFragment("раздел один")).toBe(encodeURI("раздел один"));
  });
});

describe("decodeHashFragment", () => {
  it("decodes percent-encoded fragments", () => {
    expect(decodeHashFragment("sec%20one")).toBe("sec one");
  });

  it("falls back to the raw input on malformed escapes", () => {
    expect(decodeHashFragment("%E0%A4%A")).toBe("%E0%A4%A");
  });
});

describe("normalizeHashInput", () => {
  it("returns the input unchanged when there is no leading '#'", () => {
    expect(normalizeHashInput("section")).toBe("section");
  });

  it("strips a single leading '#'", () => {
    expect(normalizeHashInput("#section")).toBe("section");
  });

  it("strips ALL leading '#' characters (idempotence guard, G9)", () => {
    expect(normalizeHashInput("##section")).toBe("section");
    expect(normalizeHashInput(normalizeHashInput("##section"))).toBe("section");
  });

  it("decodes the stripped fragment", () => {
    expect(normalizeHashInput("#sec%20one")).toBe("sec one");
  });
});

describe("getDecodedHash", () => {
  it("returns '' when the browser hash is empty", () => {
    expect(getDecodedHash({ getHash: () => "" })).toBe("");
  });

  it("strips the leading '#' and decodes", () => {
    expect(getDecodedHash({ getHash: () => "#sec%20one" })).toBe("sec one");
  });

  it("decodes a hash already missing the leading '#'", () => {
    expect(getDecodedHash({ getHash: () => "sec%20one" })).toBe("sec one");
  });
});
