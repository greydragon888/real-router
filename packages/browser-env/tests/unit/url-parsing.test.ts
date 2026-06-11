import { describe, it, expect } from "vitest";

import { safeParseUrl } from "../../src";

describe("safeParseUrl", () => {
  it("parses an absolute URL with path, query and hash", () => {
    expect(safeParseUrl("https://example.com/users?id=1#sec")).toStrictEqual({
      pathname: "/users",
      search: "?id=1",
      hash: "#sec",
    });
  });

  it("yields '/' for an authority-only URL with no path part", () => {
    expect(safeParseUrl("https://example.com")).toStrictEqual({
      pathname: "/",
      search: "",
      hash: "",
    });
  });

  it("prefixes '/' when the query starts right after the authority", () => {
    expect(safeParseUrl("https://example.com?id=1")).toStrictEqual({
      pathname: "/",
      search: "?id=1",
      hash: "",
    });
  });

  it("prefixes '/' when the hash starts right after the authority", () => {
    expect(safeParseUrl("https://example.com#sec")).toStrictEqual({
      pathname: "/",
      search: "",
      hash: "#sec",
    });
  });

  it("parses a path-relative URL with a hash", () => {
    expect(safeParseUrl("/users#sec")).toStrictEqual({
      pathname: "/users",
      search: "",
      hash: "#sec",
    });
  });

  it("keeps the query inside the pre-hash segment", () => {
    expect(safeParseUrl("/users?id=1#sec")).toStrictEqual({
      pathname: "/users",
      search: "?id=1",
      hash: "#sec",
    });
  });

  it("handles non-HTTP schemes (Electron/Tauri webviews, #496)", () => {
    expect(safeParseUrl("app://bundle/page?x=1")).toStrictEqual({
      pathname: "/page",
      search: "?x=1",
      hash: "",
    });
  });
});
