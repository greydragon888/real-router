---
"@real-router/ssr-data-plugin": minor
---

Add `@real-router/ssr-data-plugin/errors` subpath with typed loader errors (#594)

Exports `LoaderRedirect`, `LoaderNotFound`, `LoaderTimeout`, and `withTimeout` from a new `errors` subpath. Replaces the per-example `_loader-errors.ts` files that were duplicated across 12 examples (`react/vue/solid/svelte/angular` × `ssr/ssr-streaming/ssg/ssr-rsc`).

Loaders bridge to HTTP semantics by throwing typed errors; handlers match by the structural `code` field (`"LOADER_NOT_FOUND"`, `"LOADER_REDIRECT"`, `"LOADER_TIMEOUT"`) without `instanceof`:

```ts
import {
  LoaderNotFound,
  LoaderRedirect,
  withTimeout,
} from "@real-router/ssr-data-plugin/errors";

const loaders: DataLoaderFactoryMap = {
  "users.profile": () => (params) =>
    withTimeout("users.profile", 250, async () => {
      const user = await fetchUser(params.id);
      if (!user) throw new LoaderNotFound(`user:${params.id}`);
      return { user };
    }),
};
```

Errors live in `shared/ssr/errors.ts` and are mirror-exported by `@real-router/rsc-server-plugin/errors` — RSC apps can throw the same shapes without depending on `ssr-data-plugin`.

Zero runtime impact on the main entry — `errors` is a separate dist file (`dist/{esm,cjs}/errors.{mjs,js}`), tree-shaken when unused.
