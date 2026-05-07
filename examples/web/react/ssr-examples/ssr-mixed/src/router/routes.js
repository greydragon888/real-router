export const routes = [
    { name: "home", path: "/" },
    {
        name: "admin",
        path: "/admin",
        children: [{ name: "dashboard", path: "/dashboard" }],
    },
    {
        name: "users",
        path: "/users",
        children: [{ name: "profile", path: "/:id" }],
    },
    {
        name: "docs",
        path: "/docs",
        children: [
            {
                name: "detail",
                path: "/:id?format",
                defaultParams: { format: "html" },
            },
        ],
    },
];
