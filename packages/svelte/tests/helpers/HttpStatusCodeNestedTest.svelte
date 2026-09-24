<script lang="ts">
  import HttpStatusCode from "../../src/components/HttpStatusCode.svelte";
  import HttpStatusProvider from "../../src/components/HttpStatusProvider.svelte";

  import type { HttpStatusSink } from "../../src/utils/createHttpStatusSink";

  interface Props {
    outer: HttpStatusSink;
    inner: HttpStatusSink;
  }

  let { outer, inner }: Props = $props();
</script>

<HttpStatusProvider sink={outer}>
  <HttpStatusProvider sink={inner}>
    <HttpStatusCode code={404} />
  </HttpStatusProvider>
</HttpStatusProvider>
