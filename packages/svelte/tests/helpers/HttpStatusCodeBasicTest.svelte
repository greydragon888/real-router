<script lang="ts">
  import HttpStatusCode from "../../src/components/HttpStatusCode.svelte";
  import HttpStatusProvider from "../../src/components/HttpStatusProvider.svelte";

  import type { HttpStatusSink } from "../../src/utils/createHttpStatusSink";

  interface Props {
    sink: HttpStatusSink;
    code?: number;
  }

  let { sink, code = 404 }: Props = $props();
</script>

<HttpStatusProvider {sink}>
  {#snippet children()}
    <HttpStatusCode {code} />
  {/snippet}
</HttpStatusProvider>
