export const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      {
        name: "profile",
        path: "/:id",
        children: [{ name: "posts", path: "/posts" }],
      },
    ],
  },
];
