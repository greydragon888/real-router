import type { Options, Route } from "@real-router/core";

/** A URL the router lands somewhere else for (#2744, #2751). */
export interface RewrittenUrl {
  name: string;
  routes: Route[];
  options: Partial<Options>;
  href: string;
  landsOn: string;
}

const users = { name: "users", path: "/users" };

/**
 * Three of the ways the router rewrites a URL: a `forwardTo` source, a
 * trailing slash it strips, a default query it adds.
 */
export const REWRITTEN_URLS: readonly RewrittenUrl[] = [
  {
    name: "a forwardTo source",
    routes: [
      { name: "home", path: "/home" },
      { ...users, children: [{ name: "list", path: "/list" }] },
      { name: "old", path: "/old", forwardTo: "users.list" },
    ],
    options: {},
    href: "/old",
    landsOn: "/users/list",
  },
  {
    name: "a trailing slash the router strips",
    routes: [
      { name: "home", path: "/home" },
      { ...users, children: [{ name: "list", path: "/list" }] },
    ],
    options: { trailingSlash: "never" },
    href: "/users/list/",
    landsOn: "/users/list",
  },
  {
    name: "a default query the router adds",
    routes: [
      { name: "home", path: "/home" },
      {
        ...users,
        children: [
          { name: "list", path: "/list?page", defaultSearch: { page: "1" } },
        ],
      },
    ],
    options: {},
    href: "/users/list",
    landsOn: "/users/list?page=1",
  },
];
