import { describe, it, expect } from "vitest";

import { safeParseUrl } from "../../../src/browser-env";

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

  // #1921. The scheme was located with an UNANCHORED indexOf("://"), so for a
  // relative URL the first "://" was whatever the query or fragment happened to
  // contain — and everything before it was discarded. "?returnTo=" /
  // "?redirect_uri=" / "?next=" is the most common query value on the web.
  describe("a relative URL whose query or fragment contains '://'", () => {
    it("keeps the path and the whole query", () => {
      expect(
        safeParseUrl("/login?returnTo=https://app.example.com/dashboard"),
      ).toStrictEqual({
        pathname: "/login",
        search: "?returnTo=https://app.example.com/dashboard",
        hash: "",
      });
    });

    it("keeps them when the query carries more than the redirect", () => {
      expect(
        safeParseUrl("/oauth/cb?redirect_uri=https://x.io/cb&code=1"),
      ).toStrictEqual({
        pathname: "/oauth/cb",
        search: "?redirect_uri=https://x.io/cb&code=1",
        hash: "",
      });
    });

    it("keeps them when the FRAGMENT is what carries the '://'", () => {
      expect(safeParseUrl("/home#https://frag")).toStrictEqual({
        pathname: "/home",
        search: "",
        hash: "#https://frag",
      });
    });

    it("keeps them when both a query and such a fragment are present", () => {
      expect(safeParseUrl("/p?q=1#frag://z")).toStrictEqual({
        pathname: "/p",
        search: "?q=1",
        hash: "#frag://z",
      });
    });
  });

  // The counterpart: an absolute URL must still lose its scheme and authority,
  // including when its own query carries a second "://".
  it("still strips scheme and authority when the URL is absolute", () => {
    expect(
      safeParseUrl("https://app.io/login?returnTo=https://other.io/x"),
    ).toStrictEqual({
      pathname: "/login",
      search: "?returnTo=https://other.io/x",
      hash: "",
    });
  });

  it("accepts an uppercase scheme", () => {
    expect(safeParseUrl("HTTPS://Example.COM/x")).toStrictEqual({
      pathname: "/x",
      search: "",
      hash: "",
    });
  });

  it("does not read a scheme that starts with a digit", () => {
    // RFC 3986: scheme = ALPHA *( ALPHA / DIGIT / "+" / "-" / "." ). The old
    // indexOf found "://" here too and returned "/y".
    expect(safeParseUrl("1http://x/y")).toStrictEqual({
      pathname: "1http://x/y",
      search: "",
      hash: "",
    });
  });
});
