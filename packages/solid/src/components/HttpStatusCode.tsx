import { useContext } from "solid-js";

import { HttpStatusContext } from "./HttpStatusProvider";

import type { JSX } from "solid-js";

export interface HttpStatusCodeProps {
  /** HTTP status to apply to the response. Common values: 404, 410, 451, 503. */
  readonly code: number;
}

/**
 * Render-time HTTP status declaration. Mount inside a route component (typical
 * use case: a glob `*` route's NotFound page) when the status is decided by
 * the rendered tree rather than a loader.
 *
 * Writes `code` to the nearest `<HttpStatusProvider>`'s sink during render and
 * returns `null`. With no provider mounted (the standard client-side case)
 * the component is a silent no-op — same component tree hydrates without
 * touching the DOM or warning about mismatches.
 *
 * Loader-driven errors (`LoaderNotFound` → 404, `LoaderRedirect` → 30x) keep
 * working as before; this component covers render-time decisions only.
 *
 * Last write wins when several `<HttpStatusCode />` instances mount in the
 * same render pass — sink reflects the last component that ran.
 *
 * ```tsx
 * // entry-server.tsx
 * import { renderToString } from "solid-js/web";
 * import { createHttpStatusSink, HttpStatusProvider } from "@real-router/solid/ssr";
 *
 * const sink = createHttpStatusSink();
 * const html = renderToString(() => (
 *   <HttpStatusProvider sink={sink}>
 *     <RouterProvider router={router}>
 *       <App />
 *     </RouterProvider>
 *   </HttpStatusProvider>
 * ));
 * response.status(sink.code ?? 200).send(html);
 * ```
 *
 * **Streaming SSR (`renderToStream`):** the response status MUST be sent
 * before the first body byte flushes. If `<HttpStatusCode />` is mounted
 * inside a late-resolving `<Suspense>` boundary, the sink write may happen
 * AFTER the headers are already on the wire — the override is then lost.
 * Mount the component in the shell (above every `<Suspense>` that could
 * delay it), or use `renderToStringAsync` (single-shot, awaits all Suspense
 * before returning HTML).
 *
 * **Valid `code` range:** Node's `res.end()` throws `Invalid status code` on
 * `NaN`, `0`, negative values, or values `> 999` — this surfaces as a 5xx /
 * dropped connection, not silent corruption. Pass a real HTTP status integer
 * (commonly 4xx/5xx; 100-999 is what Node accepts).
 */
export function HttpStatusCode(props: HttpStatusCodeProps): JSX.Element {
  const sink = useContext(HttpStatusContext);

  if (sink) {
    // Dev-only validation: Node's `res.end()` throws `Invalid status code` on
    // NaN / 0 / negative / non-integer / >999. Surface the bad value at the
    // source so the consumer can fix the routing logic, instead of waiting
    // for the server to crash mid-response. Production builds (Vite, esbuild,
    // tsdown all replace `process.env.NODE_ENV !== "production"` with `false`)
    // strip the check.
    if (
      process.env.NODE_ENV !== "production" &&
      (!Number.isInteger(props.code) || props.code < 100 || props.code > 999)
    ) {
      console.error(
        `[real-router] <HttpStatusCode code={${String(props.code)}} /> received an invalid HTTP status code. Node's res.end() rejects values that are not an integer in [100, 999] — pass a real HTTP status (commonly 4xx/5xx).`,
      );
    }

    sink.code = props.code;
  }

  return null;
}
