import { describe, it, expect } from "vitest";

import { buildUrl, extractPath, urlToPath } from "../../src/url-utils";

describe("extractPath", () => {
  it("returns '/' for empty pathname", () => {
    expect(extractPath("", "")).toBe("/");
    expect(extractPath("", "/app")).toBe("/");
  });

  it("prepends leading slash when input lacks one (no-match branch)", () => {
    expect(extractPath("users", "/app")).toBe("/users");
    expect(extractPath("users", "")).toBe("/users");
  });

  it("returns unchanged pathname when it has a leading slash and no base match", () => {
    expect(extractPath("/users", "/app")).toBe("/users");
    expect(extractPath("/other", "/app")).toBe("/other");
  });

  it("strips base when pathname starts with `${base}/`", () => {
    expect(extractPath("/app/users", "/app")).toBe("/users");
    expect(extractPath("/app/users/view/42", "/app")).toBe("/users/view/42");
  });

  it("returns '/' when pathname equals base", () => {
    expect(extractPath("/app", "/app")).toBe("/");
  });

  it("is idempotent", () => {
    const cases = [
      ["", ""],
      ["", "/app"],
      ["users", "/app"],
      ["/users", "/app"],
      ["/app/users", "/app"],
      ["/app", "/app"],
    ] as const;

    for (const [path, base] of cases) {
      const once = extractPath(path, base);

      expect(extractPath(once, base)).toBe(once);
    }
  });
});

describe("buildUrl", () => {
  it("returns base when path is empty", () => {
    expect(buildUrl("", "/app")).toBe("/app");
    expect(buildUrl("", "")).toBe("");
  });

  it("prepends leading slash when path has no leading slash and base is empty", () => {
    expect(buildUrl("users", "")).toBe("/users");
  });

  it("returns path unchanged when base is empty and path already starts with /", () => {
    expect(buildUrl("/users", "")).toBe("/users");
  });

  it("joins base + path directly when path starts with /", () => {
    expect(buildUrl("/users", "/app")).toBe("/app/users");
  });

  it("inserts separator when path does not start with /", () => {
    expect(buildUrl("users", "/app")).toBe("/app/users");
  });

  it("never produces consecutive slashes when base is normalized", () => {
    expect(buildUrl("/x", "/app")).not.toMatch(/\/{2,}/);
    expect(buildUrl("x", "/app")).not.toMatch(/\/{2,}/);
    expect(buildUrl("/x", "")).not.toMatch(/\/{2,}/);
  });
});

describe("urlToPath", () => {
  it("parses absolute URL and returns path + search", () => {
    expect(urlToPath("https://example.com/users?q=1", "")).toBe("/users?q=1");
  });

  it("extracts path from URL regardless of scheme (desktop environments)", () => {
    // Post-desktop-support: arbitrary schemes (ftp://, custom://, tauri://)
    // are accepted — the path is what matters for routing.

    expect(urlToPath("ftp://example.com/users", "")).toBe("/users");
  });

  it("returns '/' for empty URL input (parser is total)", () => {
    expect(urlToPath("", "")).toBe("/");
  });

  it("strips base from URL path", () => {
    expect(urlToPath("https://example.com/app/users", "/app")).toBe("/users");
  });
});
