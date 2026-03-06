import { describe, it, expect, vi, beforeEach } from "vitest";

import { normalizeBase, safelyEncodePath } from "../../src/utils";

describe("normalizeBase", () => {
  it("returns empty string unchanged", () => {
    expect(normalizeBase("")).toBe("");
  });

  it("prepends leading slash if missing", () => {
    expect(normalizeBase("app")).toBe("/app");
  });

  it("removes trailing slash", () => {
    expect(normalizeBase("/app/")).toBe("/app");
  });

  it("prepends slash and removes trailing slash", () => {
    expect(normalizeBase("app/")).toBe("/app");
  });

  it("returns already-normalized base unchanged", () => {
    expect(normalizeBase("/app")).toBe("/app");
  });
});

describe("safelyEncodePath", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns unchanged ASCII path", () => {
    expect(safelyEncodePath("/path/to/page")).toBe("/path/to/page");
  });

  it("normalizes percent-encoded path", () => {
    expect(safelyEncodePath("/path%20to")).toBe("/path%20to");
  });

  it("encodes non-ASCII characters", () => {
    expect(safelyEncodePath("/über")).toBe("/%C3%BCber");
  });

  it("returns original path and warns on malformed URI", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const malformed = "%invalid";
    const result = safelyEncodePath(malformed);

    expect(result).toBe(malformed);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain(malformed);
  });
});
