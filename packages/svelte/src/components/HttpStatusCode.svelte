<!--
  @component
  Render-time HTTP status declaration. Mount inside a route component (typical
  use case: a glob `*` route's NotFound page) when the status is decided by
  the rendered tree rather than a loader.

  Writes `code` to the nearest `<HttpStatusProvider>`'s sink during component
  init and renders nothing. With no provider mounted (the standard
  client-side case) the component is a silent no-op — same component tree
  hydrates without touching the DOM or warning about mismatches.

  Loader-driven errors (`LoaderNotFound` → 404, `LoaderRedirect` → 30x) keep
  working as before; this component covers render-time decisions only.

  Last write wins when several `<HttpStatusCode />` instances mount in the
  same render pass — sink reflects the last component that ran.

  ```svelte
  <HttpStatusCode code={404} />
  ```

  **Streaming SSR ({#await}):** Svelte 5 stable does NOT chunk-stream HTTP
  for `{#await}` — the server emits the pending branch and returns the full
  response immediately, async resolution happens client-side. So the sink
  is always written by the time `await render(App, ...)` resolves, regardless
  of where `<HttpStatusCode />` is mounted. (This is RSC-like, not React 19
  / Solid streaming.) No ordering concern.

  **Hydration symmetry:** Svelte 5's hydration walker tolerates `{#if}`-branch
  asymmetry between server and client (verified by `ssr/` e2e — no warnings
  fire when SSR has the wrapper but CSR doesn't). The example's `App.svelte`
  uses `{#if httpStatusSink}` so the wrapper is server-only; this is safe in
  Svelte but would be a hydration mismatch in Vue/Solid.

  **Valid `code` range:** Node's `res.end()` throws `Invalid status code` on
  `NaN`, `0`, negative values, or values `> 999` — this surfaces as a 5xx /
  dropped connection, not silent corruption. Pass a real HTTP status integer
  (commonly 4xx/5xx; 100-999 is what Node accepts).
-->
<script lang="ts">
  import { getContext } from "svelte";

  import { HTTP_STATUS_KEY } from "../context";

  import type { HttpStatusSink } from "../utils/createHttpStatusSink";

  interface Props {
    /** HTTP status to apply to the response. Common values: 404, 410, 451, 503. */
    code: number;
  }

  let { code }: Props = $props();

  const sink = getContext<HttpStatusSink | undefined>(HTTP_STATUS_KEY);

  if (sink) {
    // svelte-ignore state_referenced_locally
    // Intentional one-time read at component init: the sink is read by the
    // server after `await render()` and a single value is the contract.
    // Consumers that need to update the code mid-render should remount. Captured
    // into a local so the validation + write below don't re-reference the prop.
    const value = code;

    // Dev-only validation: Node's `res.end()` throws `Invalid status code` on
    // NaN / 0 / negative / non-integer / >999. Surface the bad value at the
    // source; production builds strip the `process.env.NODE_ENV` check.
    if (
      process.env.NODE_ENV !== "production" &&
      (!Number.isInteger(value) || value < 100 || value > 999)
    ) {
      console.error(
        `[real-router] <HttpStatusCode code={${String(value)}} /> received an invalid HTTP status code. Node's res.end() rejects values that are not an integer in [100, 999] — pass a real HTTP status (commonly 4xx/5xx).`,
      );
    }

    sink.code = value;
  }
</script>
