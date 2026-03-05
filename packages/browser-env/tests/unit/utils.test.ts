import { logger } from "@real-router/logger";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { safelyEncodePath } from "../../src/utils";

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
    const warnSpy = vi.spyOn(logger, "warn");
    const malformed = "%invalid";
    const result = safelyEncodePath(malformed);

    expect(result).toBe(malformed);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][1]).toContain(malformed);
  });
});
