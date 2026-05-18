/**
 * Render-scoped HTTP status sink. Created per request on the server, passed to
 * `<HttpStatusProvider sink={...}>`, and read after `renderToString` /
 * `renderToStream` to apply the value to the HTTP response.
 *
 * Last write wins: if the rendered tree mounts more than one
 * `<HttpStatusCode />`, the value reflects the last component that ran during
 * the render pass.
 *
 * No-op on the client — `<HttpStatusCode />` reads the optional context and
 * skips the write when no provider is mounted, so the same component tree can
 * be hydrated without changing behaviour.
 *
 * Constraints:
 * - **Per-request only.** Don't share a sink across requests; the rendered
 *   tree mutates `code` in place. Module-level singletons leak status
 *   between concurrent requests.
 * - **Don't `Object.freeze` the sink.** The component writes to `.code`;
 *   freezing makes the assignment throw under ESM strict mode.
 * - **Hydration symmetry:** mount `<HttpStatusProvider>` on both server and
 *   client (with a throwaway client sink). Solid emits `data-hk` markers
 *   per component boundary; an extra provider on one side desyncs the
 *   counter and breaks the hydration walker.
 */
export interface HttpStatusSink {
  code: number | undefined;
}

export function createHttpStatusSink(): HttpStatusSink {
  return { code: undefined };
}
