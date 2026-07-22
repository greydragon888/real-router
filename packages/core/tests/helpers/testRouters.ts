/* eslint-disable unicorn/consistent-function-scoping */

import { createRouter } from "@real-router/core";

import type { Options, Route, Router } from "@real-router/core";

const routes: Route[] = [
  { name: "index", path: "/" },
  { name: "home", path: "/home" },
  { name: "items", path: "/items/:id" },
  {
    name: "admin",
    path: "/admin",
    children: [{ name: "dashboard", path: "/dashboard" }],
  },
  {
    name: "admin-protected",
    path: "/admin-protected",
    canActivate: () => () => false,
  },
  { name: "sign-in", path: "/sign-in" },
  {
    name: "auth-protected",
    path: "/auth-protected",
    // Guard rejects with a plain object (not an Error) — exercises the
    // wrapSyncError plain-object path. Guards cannot redirect; the object's
    // fields are merely carried as RouterError metadata.
    canActivate: () => () =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject({
        attemptedRedirect: { name: "sign-in", params: {}, path: "/sign-in" },
      }),
  },
  {
    name: "users",
    path: "/users",
    children: [
      {
        name: "view",
        path: "/view/:id",
      },
      {
        name: "list",
        path: "/list",
      },
    ],
  },
  {
    name: "orders",
    path: "/orders",
    children: [
      { name: "view", path: "/view/:id" },
      { name: "pending", path: "/pending" },
      { name: "completed", path: "/completed" },
    ],
  },
  {
    name: "settings",
    path: "/settings",
    children: [
      { name: "account", path: "/account" },
      { name: "privacy", path: "/privacy" },
      { name: "profile", path: "/profile" },
      { name: "general", path: "/general" },
    ],
  },
  {
    name: "section",
    // Was `/:section<section[\d]+>` (M1 removed the `section\d+` constraint). A bare
    // top-level `/:section` would be a single-segment catch-all — matching every
    // "not found" probe (`/nonexistent`, `/invalid`) and breaking the ROUTE_NOT_FOUND
    // suites. A static `sections/` prefix keeps `section` a param (positive tests pass
    // `{ section: "section1" }`) while a single-segment path no longer matches it.
    path: "/sections/:section",
    children: [
      { name: "view", path: "/view/:id" },
      { name: "query", path: "/query?param1&param2&param3" },
    ],
  },
  {
    name: "profile",
    path: "/profile",
    children: [
      { name: "me", path: "/" },
      { name: "user", path: "/:userId" },
    ],
  },
  {
    name: "withDefaultParam",
    path: "/with-default/:param",
    defaultParams: {
      param: "hello",
    },
  },
  {
    name: "withEncoder",
    path: "/encoded/:param1/:param2",
    encodeParams: ({ params: { one, two }, search }) => ({
      params: { param1: one, param2: two },
      search,
    }),
    decodeParams: ({ params: { param1, param2 }, search }) => ({
      params: { one: param1, two: param2 },
      search,
    }),
  },
];

export function createTestRouter(options?: Partial<Options>): Router {
  return createRouter(routes, {
    defaultRoute: "home",
    ...options,
  });
}
