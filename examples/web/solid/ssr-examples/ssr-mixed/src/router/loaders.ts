import type { DataLoaderFactoryMap, SsrMode } from "@real-router/ssr-data-plugin";
import type { State } from "@real-router/core";

/**
 * Per-route SSR mode demonstration. See README.md for the route table.
 */
export const loaders: DataLoaderFactoryMap = {
  home: () => () => ({ greeting: "Hello from full SSR" }),

  "admin.dashboard": { ssr: false },

  "users.profile": {
    ssr: "data-only",
    loader: () => (params) => ({
      id: String(params.id),
      name: `User-${String(params.id)}`,
    }),
  },

  "docs.detail": {
    ssr: (state: State): SsrMode =>
      state.params.format === "pdf" ? "client-only" : "full",
    loader: () => (params) => ({
      id: String(params.id),
      format: String(params.format),
      body: `Doc body for ${String(params.id)}`,
    }),
  },
};
