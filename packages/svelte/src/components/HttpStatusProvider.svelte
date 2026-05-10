<!--
  @component
  Wraps an SSR tree with a render-scoped `HttpStatusSink`. `<HttpStatusCode />`
  reads the sink via `getContext` and writes its `code` to it during component
  init. Read `sink.code` after `await render()` to set the HTTP response
  status.

  ```svelte
  <script lang="ts">
    import {
      HttpStatusProvider,
      createHttpStatusSink,
    } from "@real-router/svelte/ssr";

    const sink = createHttpStatusSink();
  </script>

  <HttpStatusProvider {sink}>
    <App />
  </HttpStatusProvider>
  ```
-->
<script lang="ts">
  import { setContext } from "svelte";

  import { HTTP_STATUS_KEY } from "../context";

  import type { HttpStatusSink } from "../utils/createHttpStatusSink";
  import type { Snippet } from "svelte";

  interface Props {
    sink: HttpStatusSink;
    children: Snippet;
  }

  let { sink, children }: Props = $props();

  // svelte-ignore state_referenced_locally
  // The sink reference is captured once at provider init — replacing the sink
  // mid-render isn't a supported usage pattern (the server reads it once
  // after `await render()`).
  setContext(HTTP_STATUS_KEY, sink);
</script>

{@render children()}
