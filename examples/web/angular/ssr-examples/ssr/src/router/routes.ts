import type { CurrentUser } from "../_known-users";
import type { Route } from "@real-router/core";

export interface AppDeps {
  currentUser: CurrentUser | null;
}

export const routes: Route<AppDeps>[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users?sort",
    children: [
      {
        name: "profile",
        path: "/:id",
        children: [{ name: "posts", path: "/posts" }],
      },
    ],
  },
  { name: "legacyUser", path: "/legacy-user/:id" },
  { name: "slow", path: "/slow" },
  // Mixed RenderMode demo:
  //   /marketing → RenderMode.Prerender — built once at build time, served as
  //                static HTML; no per-request server work, no auth, no data
  //                that depends on the request.
  //   /live      → RenderMode.Server   — rendered fresh per request, can read
  //                cookies / headers via REQUEST DI.
  { name: "marketing", path: "/marketing" },
  { name: "live", path: "/live" },
  // /gone is a sunset URL — the route is registered (so the SSR renderer
  // produces an HTML body explaining the situation) but `app.routes.server.ts`
  // pins its HTTP status to 410 Gone and adds a Sunset / Deprecation header
  // pair. Demonstrates declarative HTTP status override via Angular's
  // ServerRoute config — alternative to throwing a typed loader error and
  // catching it in middleware (see /boom, /slow, /legacy-user/:id).
  { name: "gone", path: "/gone" },
  {
    name: "dashboard",
    path: "/dashboard",
    canActivate: (_router, getDep) => () => getDep("currentUser") !== null,
  },
  {
    name: "admin",
    path: "/admin",
    canActivate: (_router, getDep) => () => {
      const user = getDep("currentUser");

      return user?.role === "admin";
    },
  },
  { name: "boom", path: "/boom" },
  // Per-route SSR mode demo (#597): server skips loader for `ssr: false`.
  { name: "widget", path: "/widget" },
];
