<script lang="ts">
  import HttpStatusCode from "../../src/components/HttpStatusCode.svelte";
  import HttpStatusProvider from "../../src/components/HttpStatusProvider.svelte";

  import type { HttpStatusSink } from "../../src/utils/createHttpStatusSink";

  interface Props {
    sink: HttpStatusSink;
  }

  let { sink }: Props = $props();
</script>

<HttpStatusProvider {sink}>
  {#snippet children()}
    <HttpStatusCode code={404} />
    <HttpStatusCode code={410} />
    <HttpStatusCode code={503} />
  {/snippet}
</HttpStatusProvider>
