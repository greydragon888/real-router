import type {
  DataLoaderFactoryMap,
  DataLoaderTarget,
  SsrLoaderContext,
  SsrMode,
} from "@real-router/ssr-data-plugin";
import type { State } from "@real-router/core";

/**
 * Per-route SSR mode demonstration.
 */
export const loaders: DataLoaderFactoryMap = {
  // `fetchedAt` + `aborts` make every loader call observable in the DOM
  // for the `invalidate(router, "data")` dogfooding (Home page Refresh
  // button). The 25 ms delay widens the race window so rapid double-click
  // reliably crosses leave handlers; the `signal.addEventListener("abort", …)`
  // reject demonstrates the cancellation-aware loader contract (#605).
  //
  // Realistic pattern: handle BOTH already-aborted and aborts-during-await
  // — a signal aborted before the listener is added does NOT auto-fire,
  // so check `signal.aborted` upfront.
  home: () => {
    let aborts = 0;

    return async (_target: DataLoaderTarget, ctx?: SsrLoaderContext) => {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 25);

        const onAbort = (): void => {
          clearTimeout(t);
          aborts += 1;
          reject(new DOMException("aborted", "AbortError"));
        };

        if (ctx?.signal.aborted) {
          onAbort();

          return;
        }

        ctx?.signal.addEventListener("abort", onAbort, { once: true });
      });

      return {
        greeting: "Hello from full SSR",
        fetchedAt: Date.now(),
        aborts,
      };
    };
  },

  "admin.dashboard": { ssr: false },

  "users.profile": {
    ssr: "data-only",
    loader: () => ({ params }) => ({
      id: String(params.id),
      name: `User-${String(params.id)}`,
    }),
  },

  "docs.detail": {
    ssr: (state: State): SsrMode =>
      state.search.format === "pdf" ? "client-only" : "full",
    loader: () => ({ params, search }) => ({
      id: String(params.id),
      format: String(search.format),
      body: `Doc body for ${String(params.id)}`,
    }),
  },
};
