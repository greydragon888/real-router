import { useContext } from "preact/hooks";

import { HttpStatusContext } from "./HttpStatusProvider";

import type { ComponentChildren } from "preact";

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
 * import { renderToString } from "preact-render-to-string";
 * import { createHttpStatusSink, HttpStatusProvider } from "@real-router/preact/ssr";
 *
 * const sink = createHttpStatusSink();
 * const html = renderToString(
 *   <HttpStatusProvider sink={sink}>
 *     <RouterProvider router={router}>
 *       <App />
 *     </RouterProvider>
 *   </HttpStatusProvider>,
 * );
 * response.status(sink.code ?? 200).send(html);
 * ```
 *
 * **Streaming SSR (`renderToReadableStream`):** the response status MUST be
 * sent before the first body byte flushes. If `<HttpStatusCode />` is mounted
 * inside a late-resolving `<Suspense>` boundary, the sink write may happen
 * AFTER the headers are already on the wire — the override is then lost.
 * Mount the component in the shell (above every `<Suspense>` that could
 * delay it). For non-streaming SSR (`renderToString` / `renderToStringAsync`)
 * there is no such ordering concern.
 *
 * **Valid `code` range:** Node's `res.end()` throws `Invalid status code` on
 * `NaN`, `0`, negative values, or values `> 999` — this surfaces as a 5xx /
 * dropped connection, not silent corruption. Pass a real HTTP status integer
 * (commonly 4xx/5xx; 100-999 is what Node accepts).
 */
export function HttpStatusCode({
  code,
}: HttpStatusCodeProps): ComponentChildren {
  const sink = useContext(HttpStatusContext);

  if (sink) {
    sink.code = code;
  }

  return null;
}
