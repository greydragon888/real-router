/**
 * Render-scoped HTTP status sink. Created per request on the server, passed to
 * `<HttpStatusProvider sink={...}>`, and read after `await render()` from
 * `svelte/server` to apply the value to the HTTP response.
 *
 * Last write wins: if the rendered tree mounts more than one
 * `<HttpStatusCode />`, the value reflects the last component that ran during
 * the render pass.
 *
 * No-op on the client — `<HttpStatusCode />` reads the optional injected sink
 * and skips the write when no provider is mounted, so the same component tree
 * can be hydrated without changing behaviour.
 *
 * Constraints:
 * - **Per-request only.** Don't share a sink across requests; the rendered
 *   tree mutates `code` in place. Module-level singletons leak status
 *   between concurrent requests.
 * - **Don't `Object.freeze` the sink.** The component writes to `.code`;
 *   freezing makes the assignment throw under ESM strict mode.
 * - **Hydration is tolerant.** Svelte 5's hydration walker accepts
 *   `{#if}`-branch asymmetry between server and client (verified by `ssr/`
 *   e2e), so the example app uses a server-only provider wrapper. This
 *   contrasts with Vue/Solid, which require symmetric provider mounting.
 */
export interface HttpStatusSink {
  code: number | undefined;
}

export function createHttpStatusSink(): HttpStatusSink {
  return { code: undefined };
}
