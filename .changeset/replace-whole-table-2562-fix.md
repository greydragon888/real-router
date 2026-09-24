---
"@real-router/validation-plugin": minor
---

`replace()` judges its batch as the whole new table, not against the table it replaces (#2562)

With the plugin installed, `getRoutesApi(router).replace(routes)` compared the
batch with the routes it was about to discard. A batch that re-declares a
current route, which is what an HMR swap does, was refused, although bare core
accepts it:

```ts
const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
];
const router = createRouter(routes);

router.usePlugin(validationPlugin());

getRoutesApi(router).replace(routes);
// 0.28.3: [router.addRoute] Route "home" already exists
// now:    accepted
```

The plugin's route checks now judge a `replace` batch as they judge the same
batch added to an empty router under the same root, down to the message; a
reserved `@@` name is still refused as `[router.replaceRoutes]`, the door the
caller called. Measured with the plugin installed:

| The batch…                                                   | 0.28.3                          | now                                                      |
| ------------------------------------------------------------ | ------------------------------- | -------------------------------------------------------- |
| re-declares a current route                                  | `Route "home" already exists`   | accepted                                                 |
| gives a current path to a new name                           | `Path "/" is already defined`   | accepted                                                 |
| reverses a forward the current table holds                   | `Route "a" already exists`      | accepted                                                 |
| keeps a forward target and drops the param it had            | `Route "target" already exists` | accepted                                                 |
| keeps a forward target and gives it a param the source lacks | `Route "target" already exists` | `forwardTo target "target" requires params [id] …`       |
| forwards to a route it drops                                 | accepted                        | `forwardTo target "target" does not exist for route "x"` |

**Breaking:** the last row is a new refusal. The plugin already refused a
forward to a route no table holds; it accepted one to a route the batch drops
only because the table being replaced still held it. After the swap that
forward points at nothing. Keep the target in the batch or remove the forward.

Unchanged: a batch that duplicates a name or a path inside itself is refused
as before, an absolute (`~`) path under a parameterised root path is still
refused (the root survives `replace`), and `add` is judged against the
registered table as before.
