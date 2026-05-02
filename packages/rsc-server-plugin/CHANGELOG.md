# @real-router/rsc-server-plugin

## 0.1.0

### Minor Changes

- [#572](https://github.com/greydragon888/real-router/pull/572) [`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/rsc-server-plugin` — per-route `ReactNode` (RSC payload) loading via `start()` interceptor ([#566](https://github.com/greydragon888/real-router/issues/566))

  New plugin mirroring `@real-router/ssr-data-plugin` for React Server Components. Loaders return `ReactNode` (sync or async); the plugin writes the resolved node to `state.context.rsc` via the `"rsc"` namespace claim. Bundler-agnostic — the caller pipes the published node through their bundler's Flight renderer (`@vitejs/plugin-rsc`, `react-server-dom-webpack`, etc.).

  ```typescript
  router.usePlugin(rscServerPluginFactory({
    "users.profile": () => async (params) => {
      const user = await fetchUser(params.id);
      return <UserProfile user={user} />;
    },
  }));

  const state = await router.start(url);
  const flight = renderToReadableStream(state.context.rsc);
  const json = serializeRouterState(state, { excludeContext: ["rsc"] });
  ```

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0
