import { describe, it, expect } from "vitest";

import {
  DEFAULT_ACTIVE_OPTIONS,
  normalizeActiveOptions,
} from "../../src/normalizeActiveOptions";

describe("normalizeActiveOptions", () => {
  it("returns defaults when options is undefined", () => {
    expect(normalizeActiveOptions()).toStrictEqual({
      strict: false,
      ignoreQueryParams: true,
      hash: undefined,
    });
  });

  it("returns defaults when options is empty object", () => {
    expect(normalizeActiveOptions({})).toStrictEqual({
      strict: false,
      ignoreQueryParams: true,
      hash: undefined,
    });
  });

  it("applies strict override", () => {
    expect(normalizeActiveOptions({ strict: true })).toStrictEqual({
      strict: true,
      ignoreQueryParams: true,
      hash: undefined,
    });
  });

  it("applies ignoreQueryParams override", () => {
    expect(normalizeActiveOptions({ ignoreQueryParams: false })).toStrictEqual({
      strict: false,
      ignoreQueryParams: false,
      hash: undefined,
    });
  });

  it("applies both overrides", () => {
    expect(
      normalizeActiveOptions({ strict: true, ignoreQueryParams: false }),
    ).toStrictEqual({
      strict: true,
      ignoreQueryParams: false,
      hash: undefined,
    });
  });

  it("preserves hash when defined (#532)", () => {
    expect(normalizeActiveOptions({ hash: "section" })).toStrictEqual({
      strict: false,
      ignoreQueryParams: true,
      hash: "section",
    });
  });

  it("preserves hash empty-string sentinel (clear-variant active)", () => {
    expect(normalizeActiveOptions({ hash: "" })).toStrictEqual({
      strict: false,
      ignoreQueryParams: true,
      hash: "",
    });
  });

  it("DEFAULT_ACTIVE_OPTIONS is frozen", () => {
    expect(Object.isFrozen(DEFAULT_ACTIVE_OPTIONS)).toBe(true);
  });
});
