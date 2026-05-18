<script lang="ts">
  import RouterProvider from "../../../src/RouterProvider.svelte";
  import StressConsumer from "./StressConsumer.svelte";

  import type { Router } from "@real-router/core";

  let { router }: { router: Router } = $props();

  // `{#key router}` forces a fresh RouterProvider subtree on every router
  // identity change — this is the supported HMR / test-harness pattern.
  // Re-running the script gives a new createRouteSource + setContext per
  // router instance, so child consumers transparently re-bind.
</script>

{#key router}
  <RouterProvider {router}>
    <StressConsumer nodeName="" />
  </RouterProvider>
{/key}
