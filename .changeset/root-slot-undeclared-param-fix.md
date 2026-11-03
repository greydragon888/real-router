---
"@real-router/core": patch
---

The undeclared-param diagnostic counts a slot the root declares as declared (#2895)

With `@real-router/validation-plugin` installed and `setRootPath("/app/:tenant")`, `navigate("users.view", { tenant: "b" })` warned `Param "tenant" is declared nowhere on route "users.view"`, although the value reaches the URL (`/app/b/users/view`). The diagnostic now counts the root's path slots as declared on every route, as the URL builder does. A key declared nowhere still warns.
