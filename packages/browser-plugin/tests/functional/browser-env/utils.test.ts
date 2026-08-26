import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  normalizeBase,
  safelyEncodePath,
} from "../../../src/browser-env/utils";

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

  it("collapses consecutive slashes to one", () => {
    expect(normalizeBase("//app//")).toBe("/app");
  });

  it("collapses interior runs of slashes", () => {
    expect(normalizeBase("/a///b////c")).toBe("/a/b/c");
  });

  it("collapses a lone '/' to empty string", () => {
    expect(normalizeBase("/")).toBe("");
  });

  it("collapses repeated slashes down to empty string", () => {
    expect(normalizeBase("//")).toBe("");
    expect(normalizeBase("///")).toBe("");
  });

  it("is idempotent", () => {
    const cases = ["/app", "//app//", "app", "", "/", "//a//b//"];

    for (const c of cases) {
      const once = normalizeBase(c);

      expect(normalizeBase(once)).toBe(once);
    }
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

  // #1920 moved what reaches the guard. A truncated escape no longer does —
  // nothing decodes any more, so `%invalid` is simply carried through (pinned
  // just below). A LONE SURROGATE still throws out of `encodeURI`, which is what
  // keeps this branch, and its warning, reachable at all.
  it("returns the original path and warns on input it cannot encode", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unencodable = "/\uD800";
    const result = safelyEncodePath(unencodable);

    expect(result).toBe(unencodable);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain(unencodable);
  });

  it("carries a percent that begins nothing interpretable, without warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(safelyEncodePath("%invalid")).toBe("%invalid");
    expect(safelyEncodePath("/%E0%A4%A")).toBe("/%E0%A4%A");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("preserves query string and hash fragment", () => {
    expect(safelyEncodePath("/users?q=hello&page=1#section")).toBe(
      "/users?q=hello&page=1#section",
    );
  });

  // #1920. `%2F` is the only legal way to carry a literal "/" inside a segment,
  // and `buildPath` emits exactly that. `decodeURI` deliberately PRESERVES the
  // escapes of reserved characters — that is its defining difference from
  // `decodeURIComponent` — so `encodeURI(decodeURI(p))` escaped the surviving
  // `%` and turned `%2F` into `%252F`, once and permanently.
  it.each([
    ["/files/a%2Fb", "slash"],
    ["/files/a%3Fb", "question mark"],
    ["/files/a%23b", "hash"],
    ["/files/a%26b", "ampersand"],
    ["/files/a%2Bb", "plus"],
  ])("leaves an escaped %s exactly as it found it", (path) => {
    expect(safelyEncodePath(path)).toBe(path);
  });

  it("recognises a lowercase escape as an escape", () => {
    expect(safelyEncodePath("/files/a%2fb")).toBe("/files/a%2fb");
  });

  // The second class #1920 moves. `decodeURI` DOES decode the unreserved set,
  // so the old pair normalised "%41" to "A". An escape is now left alone
  // whatever it encodes. Harmless: the matcher decodes both forms to "A" (pinned
  // in the property suite) and `buildPath` never emits such an escape, so this
  // is only reachable from a hand-typed URL.
  it("no longer rewrites an escape whose literal form needs none", () => {
    expect(safelyEncodePath("/files/%41")).toBe("/files/%41");
    expect(safelyEncodePath("/files/%7Ex")).toBe("/files/%7Ex");
  });

  // The counterpart: an escape the path does NOT already carry still gets one.
  // Without this cell the fix could be "return the input" and stay green.
  it("still encodes what is not escaped yet, alongside what is", () => {
    expect(safelyEncodePath("/files/a%2Fb/ü x")).toBe(
      "/files/a%2Fb/%C3%BC%20x",
    );
  });
});
