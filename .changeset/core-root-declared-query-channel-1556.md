---
"@real-router/core": minor
---

Classify a root-declared query key into the query channel (#1556)

Channel separation now reads the **same** declaration registry the query-string
build reads, so a key declared on the root path — `setRootPath("?lang&theme")`,
which is how `@real-router/persistent-params-plugin` declares its keys — is
finally recognised as the query param it already printed as.

Previously the two disagreed: the matcher unions the root node's
`?`-declarations into each route's declared query params (that is why they print,
even under `queryParamsMode: "strict"`), but core derived its own list by walking
the route's match segments — which never contain the root node. A root-declared
key was therefore classified as a **path** param:

```ts
const router = createRouter([{ name: "g", path: "/g" }]);
getPluginApi(router).setRootPath("?lang");

await router.start("/g?lang=en");
// before: params { lang: "en" }, search {}   ← wrong channel
// now:    params {},             search { lang: "en" }

await router.navigate("g", { lang: "fr" });
// before: path "/g"          ← the declared key vanished from the URL
// now:    path "/g?lang=fr"
```

It also broke active-link detection in **both** spellings: after
`start("/g?lang=en")`, `isActiveRoute("g", { lang: "en" })` and
`isActiveRoute("g", {}, { lang: "en" })` were both `false`, so a `<Link>` carrying
a persistent param rendered inactive on the very page it pointed at. Both now
return `true`.

**Behaviour change:** a persisted / root-declared key moves from `state.params`
to `state.search`. This is the channel the plugin's own contract already
documents; read it from `state.search` (or, channel-independently, from
`state.context.persistentParams`). A route that repeats the declaration itself
(`/route/:id?lang`) was already correct and is unaffected.

The path/query name collision carve-out is unchanged: on `/items/:id?id` the
params-bag `id` stays path-owned and only an explicit `search` twin reaches the
query channel (#843 / #1549).
