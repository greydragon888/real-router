import { describe, it, expect } from "vitest";

import {
  createOptionsValidator,
  nonNegativeIntegerRule,
  safeBaseRule,
  safeHashPrefixRule,
} from "../../src/validation";

describe("createOptionsValidator", () => {
  const defaults = { base: "", max: 10 };

  it("is a no-op when opts is undefined", () => {
    const validate = createOptionsValidator(defaults, "test");

    expect(() => {
      validate(undefined);
    }).not.toThrow();
  });

  it("ignores unknown keys", () => {
    const validate = createOptionsValidator(defaults, "test");

    expect(() => {
      validate({ foo: "bar" } as never);
    }).not.toThrow();
  });

  it("ignores explicit undefined values", () => {
    const validate = createOptionsValidator(defaults, "test");

    expect(() => {
      validate({ base: undefined, max: undefined } as never);
    }).not.toThrow();
  });

  it("throws when type mismatches", () => {
    const validate = createOptionsValidator(defaults, "test");

    expect(() => {
      validate({ max: "10" as unknown as number });
    }).toThrow(/Invalid type for 'max': expected number, got string/);
  });

  it("runs rules when provided", () => {
    const validate = createOptionsValidator(defaults, "test", {
      max: nonNegativeIntegerRule,
    });

    expect(() => {
      validate({ max: -1 });
    }).toThrow(/non-negative integer/);
  });

  it("passes valid values through both type check and rule", () => {
    const validate = createOptionsValidator(defaults, "test", {
      base: safeBaseRule,
      max: nonNegativeIntegerRule,
    });

    expect(() => {
      validate({ base: "/app", max: 5 });
    }).not.toThrow();
  });
});

describe("safeBaseRule", () => {
  it("accepts normal base paths", () => {
    expect(safeBaseRule.validate("/app")).toBeNull();
    expect(safeBaseRule.validate("/")).toBeNull();
    expect(safeBaseRule.validate("")).toBeNull();
    expect(safeBaseRule.validate("app/sub")).toBeNull();
  });

  it("rejects control characters", () => {
    expect(safeBaseRule.validate("/app\nX")).toMatch(/control/);
    expect(safeBaseRule.validate("/app\u0000")).toMatch(/control/);
    expect(safeBaseRule.validate("/app\u007F")).toMatch(/control/);
  });

  it("rejects '..' segments", () => {
    expect(safeBaseRule.validate("..")).toMatch(/\.\./);
    expect(safeBaseRule.validate("../evil")).toMatch(/\.\./);
    expect(safeBaseRule.validate("/app/../evil")).toMatch(/\.\./);
  });

  it("allows substrings containing '..' inside a segment", () => {
    expect(safeBaseRule.validate("/app..foo")).toBeNull();
    expect(safeBaseRule.validate("/a..b")).toBeNull();
  });
});

describe("safeHashPrefixRule", () => {
  it("accepts empty prefix and common bang/tilde/dot prefixes", () => {
    expect(safeHashPrefixRule.validate("")).toBeNull();
    expect(safeHashPrefixRule.validate("!")).toBeNull();
    expect(safeHashPrefixRule.validate("~")).toBeNull();
    expect(safeHashPrefixRule.validate(".")).toBeNull();
    expect(safeHashPrefixRule.validate("@")).toBeNull();
    expect(safeHashPrefixRule.validate("!!")).toBeNull();
  });

  it("rejects prefix containing '/'", () => {
    expect(safeHashPrefixRule.validate("/")).toMatch(/slash/);
    expect(safeHashPrefixRule.validate("!/")).toMatch(/slash/);
    expect(safeHashPrefixRule.validate("a/b")).toMatch(/slash/);
  });

  it("rejects prefix containing '#'", () => {
    expect(safeHashPrefixRule.validate("#")).toMatch(/'#'/);
    expect(safeHashPrefixRule.validate("!#")).toMatch(/'#'/);
  });

  it("rejects prefix containing '?'", () => {
    expect(safeHashPrefixRule.validate("?")).toMatch(/'\?'/);
    expect(safeHashPrefixRule.validate("!?")).toMatch(/'\?'/);
  });

  it("rejects control characters", () => {
    expect(safeHashPrefixRule.validate("!\n")).toMatch(/control/);
    expect(safeHashPrefixRule.validate("\u0000")).toMatch(/control/);
    expect(safeHashPrefixRule.validate("\u007F")).toMatch(/control/);
  });
});

describe("nonNegativeIntegerRule", () => {
  it("accepts non-negative integers", () => {
    expect(nonNegativeIntegerRule.validate(0)).toBeNull();
    expect(nonNegativeIntegerRule.validate(1)).toBeNull();
    expect(nonNegativeIntegerRule.validate(1000)).toBeNull();
  });

  it("rejects NaN", () => {
    expect(nonNegativeIntegerRule.validate(Number.NaN)).toMatch(/finite/);
  });

  it("rejects Infinity", () => {
    expect(nonNegativeIntegerRule.validate(Number.POSITIVE_INFINITY)).toMatch(
      /finite/,
    );
    expect(nonNegativeIntegerRule.validate(Number.NEGATIVE_INFINITY)).toMatch(
      /finite/,
    );
  });

  it("rejects non-integer numbers", () => {
    expect(nonNegativeIntegerRule.validate(0.5)).toMatch(/integer/);
    expect(nonNegativeIntegerRule.validate(1.1)).toMatch(/integer/);
  });

  it("rejects negative numbers", () => {
    expect(nonNegativeIntegerRule.validate(-1)).toMatch(/non-negative/);
  });
});
