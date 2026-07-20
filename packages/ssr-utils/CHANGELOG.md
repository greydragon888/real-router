# @real-router/ssr-utils

## 0.1.0

### Minor Changes

- [#1544](https://github.com/greydragon888/real-router/pull/1544) [`22e7d44`](https://github.com/greydragon888/real-router/commit/22e7d4441fbf5f70c55f50a8ab08615991a4d427) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/ssr-utils` package — SSR/SSG/hydration helpers extracted from core ([#1543](https://github.com/greydragon888/real-router/issues/1543))

  New standalone package hosting the router-level SSR primitives previously
  exposed via the `@real-router/core/utils` subpath: `serializeState`,
  `serializeRouterState`, `hydrateRouter`, `getStaticPaths`, and
  `createRequestScope`. Isomorphic (server + client), depends on
  `@real-router/core` as a peer.

  **Migration:**

  ```diff
  - import { hydrateRouter, serializeRouterState } from "@real-router/core/utils";
  + import { hydrateRouter, serializeRouterState } from "@real-router/ssr-utils";
  ```

  `SerializedRouterState` is now defined in `@real-router/core/types` (core owns
  the shape of its own hydration scratchpad) and re-exported from
  `@real-router/ssr-utils` for backward-compatible imports.
