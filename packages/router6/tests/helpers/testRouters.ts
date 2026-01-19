/* eslint-disable unicorn/consistent-function-scoping */

import { createRouter } from "router6";

import type { Options, Route, Router } from "router6";

const routes: Route[] = [
  { name: "index", path: "/" },
  { name: "home", path: "/home" },
  { name: "items", path: "/items/:id" },
  { name: "admin", path: "/admin", canActivate: () => () => false },
  { name: "sign-in", path: "/sign-in" },
  {
    name: "auth-protected",
    path: "/auth-protected",
    // Redirect via Promise.reject with plain object (not Error)
    // This allows the redirect field to be preserved in RouterError
    canActivate: () => () =>
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      Promise.reject({
        redirect: { name: "sign-in", params: {}, path: "/sign-in" },
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
    path: String.raw`/:section<section[\d]+>`,
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
    encodeParams: ({ one, two }) => ({
      param1: one,
      param2: two,
    }),
    decodeParams: ({ param1, param2 }) => ({
      one: param1,
      two: param2,
    }),
  },
];

export function createTestRouter(options?: Partial<Options>): Router {
  return createRouter(routes, {
    defaultRoute: "home",
    ...options,
  });
}
