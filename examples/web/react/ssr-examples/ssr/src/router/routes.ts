export const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "profile", path: "/:id" }],
  },
  {
    name: "dashboard",
    path: "/dashboard",
    canActivate:
      (_router: unknown, getDep: (key: string) => unknown) => (): boolean =>
        getDep("isAuthenticated") === true,
  },
  // Demonstrates loader error propagation: this route's loader throws,
  // entry-server.tsx catches it and renders a 500 page.
  { name: "boom", path: "/boom" },
];
