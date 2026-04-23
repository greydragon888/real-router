export const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/" },
      { name: "profile", path: "/:id" },
    ],
  },
  {
    name: "dashboard",
    path: "/dashboard",
    canActivate:
      (_router: unknown, getDep: (key: string) => unknown) => (): boolean =>
        getDep("isAuthenticated") === true,
  },
];
