---
"@real-router/rsc-server-plugin": minor
---

Add `@real-router/rsc-server-plugin/errors` subpath with typed loader errors (#594)

Mirror of `@real-router/ssr-data-plugin/errors` — exports `LoaderRedirect`, `LoaderNotFound`, `LoaderTimeout`, and `withTimeout` from a new `errors` subpath. Same shared source under `shared/ssr/errors.ts`.

RSC apps throw the same error shapes as classical SSR apps and discriminate via the structural `code` field — without taking a dependency on `ssr-data-plugin`:

```ts
import { LoaderNotFound } from "@real-router/rsc-server-plugin/errors";

const loaders: RscLoaderFactoryMap = {
  "users.profile": (_router, getDep) => async (params) => {
    const user = await getDep("db").users.findById(params.id);
    if (!user) throw new LoaderNotFound(`user:${params.id}`);
    return <UserProfile user={user} />;
  },
};
```

Zero runtime impact on the main entry — `errors` is a separate dist file, tree-shaken when unused.
