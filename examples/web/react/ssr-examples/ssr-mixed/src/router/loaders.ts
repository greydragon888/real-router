import type { DataLoaderFactoryMap, SsrMode } from "@real-router/ssr-data-plugin";
import type { State } from "@real-router/core";

/**
 * Per-route SSR mode demonstration.
 *
 * - `home` — full SSR (default behaviour, short form).
 * - `admin.dashboard` — `ssr: false` (client-only): server skips the loader,
 *   ships shell HTML, client fetches via its own mechanism.
 * - `users.profile` — `ssr: "data-only"`: server runs the loader, ships JSON,
 *   but the application renders shell-only HTML.
 * - `docs.detail` — function-form resolver: mode depends on `format` param.
 *   `?format=pdf` → `client-only` (no point rendering PDFs server-side);
 *   `?format=html` (default) → `full`.
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
