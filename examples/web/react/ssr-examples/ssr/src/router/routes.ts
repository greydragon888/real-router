interface CurrentUser {
  id: string;
  name: string;
  role: "admin" | "user";
}

export const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    // ?sort declares `sort` as a query parameter; available as state.search.sort.
    path: "/users?sort",
    children: [
      {
        name: "profile",
        path: "/:id",
        // Nested child loader — runs in addition to the parent loader.
        children: [{ name: "posts", path: "/posts" }],
      },
    ],
  },
  {
    name: "dashboard",
    path: "/dashboard",
    // Cookie-based DI: getDep("currentUser") returns the parsed User object
    // (or null) — guard rejects when no user is authenticated.
    canActivate:
      (_router: unknown, getDep: (key: string) => unknown) => (): boolean =>
        getDep("currentUser") !== null,
  },
  {
    // Admin-only route demonstrates role-aware DI guards.
    name: "admin",
    path: "/admin",
    canActivate:
      (_router: unknown, getDep: (key: string) => unknown) => (): boolean => {
        const user = getDep("currentUser") as CurrentUser | null;

        return user?.role === "admin";
      },
  },
  // Demonstrates loader error propagation: this route's loader throws,
  // entry-server.tsx catches it and renders a 500 page.
  { name: "boom", path: "/boom" },
  // Legacy redirect: loader throws LoaderRedirect → 301 + Location.
  { name: "legacyUser", path: "/legacy-user/:id" },
  // Slow loader for AbortController + LoaderTimeout demo.
  { name: "slow", path: "/slow" },
];
