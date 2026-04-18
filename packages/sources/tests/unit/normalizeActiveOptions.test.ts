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
    });
  });

  it("returns defaults when options is empty object", () => {
    expect(normalizeActiveOptions({})).toStrictEqual({
      strict: false,
      ignoreQueryParams: true,
    });
  });

  it("applies strict override", () => {
    expect(normalizeActiveOptions({ strict: true })).toStrictEqual({
      strict: true,
      ignoreQueryParams: true,
    });
  });

  it("applies ignoreQueryParams override", () => {
    expect(normalizeActiveOptions({ ignoreQueryParams: false })).toStrictEqual({
      strict: false,
      ignoreQueryParams: false,
    });
  });

  it("applies both overrides", () => {
    expect(
      normalizeActiveOptions({ strict: true, ignoreQueryParams: false }),
    ).toStrictEqual({
      strict: true,
      ignoreQueryParams: false,
    });
  });

  it("DEFAULT_ACTIVE_OPTIONS is frozen", () => {
    expect(Object.isFrozen(DEFAULT_ACTIVE_OPTIONS)).toBe(true);
  });
});
