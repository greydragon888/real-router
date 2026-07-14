<script lang="ts">
  import { RouteView, RouterProvider } from "@real-router/svelte";
  import type { Router } from "@real-router/core";

  import Chain from "./Chain.svelte";

  let { router, depth }: { router: Router; depth: number } = $props();
</script>

<RouterProvider {router}>
  <RouteView nodeName="">
    {#snippet home()}
      <main data-testid="page-home"><h1>Home</h1></main>
    {/snippet}
    {#snippet sec()}
      <Chain level={1} dotted="sec" {depth} />
    {/snippet}
  </RouteView>
</RouterProvider>
