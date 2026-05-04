import type { CurrentUser } from "../_known-users";

export const routes = [
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
  {
    name: "dashboard",
    path: "/dashboard",
    canActivate:
      (_router: unknown, getDep: (key: string) => unknown) => (): boolean =>
        getDep("currentUser") !== null,
  },
  {
    name: "admin",
    path: "/admin",
    canActivate:
      (_router: unknown, getDep: (key: string) => unknown) => (): boolean => {
        const user = getDep("currentUser") as CurrentUser | null;

        return user?.role === "admin";
      },
  },
  { name: "slow", path: "/slow" },
  { name: "boom", path: "/boom" },
];
