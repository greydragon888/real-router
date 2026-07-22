import { describe, it, expect } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

/**
 * `trailingSlash: "preserve"` (the default) via the PUBLIC matcher
 * (`getPluginApi(router).matchPath`). The matcher's `buildPath` strips the
 * trailing slash, so `matchSourceTrailingSlash` re-attaches it iff the SOURCE
 * path carried one — and `state.path` is the exact observable.
 *
 * audit 2026-06-23 — previously KEEP (claimed the `sourcePathPart.length > 1`
 * guard was unreachable via matchPath). That was wrong: a route at path "/" with
 * `forwardTo` makes `matchPath("/")` produce a length-1 source ("/") against a
 * NON-root rewritten — exercising that guard publicly. With that, the whole
 * helper is covered through matchPath, so this is now fully public (no white-box,
 * out of the eslint allowlist). The two remaining source-level guards
 * (`pathPart.endsWith("/")` for a non-root rewritten; a hash in the rewritten)
 * are defensive against matcher output that never occurs — equivalent mutants,
 * not behaviours to pin.
 */
const usersRoute: Route[] = [{ name: "users", path: "/users" }];

describe("trailingSlash: preserve — matchPath re-attaches the source slash", () => {
  const match = (routes: Route[], path: string) =>
    getPluginApi(createRouter(routes, { allowNotFound: true })).matchPath(path);

  it("re-attaches a trailing slash the source carried (rewritten had none)", () => {
    expect(match(usersRoute, "/users/")?.path).toBe("/users/");
  });

  it("leaves the path unchanged when the source had no trailing slash", () => {
    expect(match(usersRoute, "/users")?.path).toBe("/users");
  });

  it("returns the root rewritten ('/') as-is", () => {
    expect(match([{ name: "root", path: "/" }], "/")?.path).toBe("/");
  });

  it("does NOT re-attach for a length-1 source ('/') against a non-root rewritten (forwardTo)", () => {
    // matchPath("/") resolves the "/" route, which forwardTo's to a non-root
    // route → source "/" (length 1) paired with rewritten "/deep". The
    // `sourcePathPart.length > 1` guard must keep it "/deep", not "/deep/".
    const routes: Route[] = [
      { name: "home", path: "/", forwardTo: "deep" },
      { name: "deep", path: "/deep" },
    ];

    expect(match(routes, "/")?.path).toBe("/deep");
  });

  it("re-attaches the trailing slash BEFORE the query string", () => {
    // RFC-4 M2 (#1548): `state.path` is the FULL URL (query included) — the
    // trailing slash is re-attached to the path part, BEFORE the query string —
    // and `q` also round-trips through the `.search` channel.
    const m = match(usersRoute, "/users/?q=1");

    expect(m?.path).toBe("/users/?q=1");
    expect(m?.search).toStrictEqual({ q: 1 });
  });

  it("leaves the query path unchanged when the source had no trailing slash", () => {
    const m = match(usersRoute, "/users?q=1");

    expect(m?.path).toBe("/users?q=1");
    expect(m?.search).toStrictEqual({ q: 1 });
  });
});
