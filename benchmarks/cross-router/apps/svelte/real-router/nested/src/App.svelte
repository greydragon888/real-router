<script lang="ts">
  // RouteView reads context internally, so it can live directly inside
  // <RouterProvider> (it renders as a child). Only the top-level home/sec switch
  // lives here; SectionLayout owns the a/b sibling switch under nodeName="sec".
  import { RouteView, RouterProvider } from "@real-router/svelte";
  import type { Router } from "@real-router/core";

  import SectionLayout from "./SectionLayout.svelte";

  let { router }: { router: Router } = $props();
</script>

<RouterProvider {router}>
  <RouteView nodeName="">
    {#snippet home()}
      <main data-testid="page-home"><h1>Home</h1></main>
    {/snippet}
    {#snippet sec()}
      <SectionLayout />
    {/snippet}
  </RouteView>
</RouterProvider>
