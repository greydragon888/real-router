<script lang="ts">
  import RouterProvider from "../../../src/RouterProvider.svelte";
  import StressConsumer from "./StressConsumer.svelte";

  import type { Router } from "@real-router/core";

  let {
    router1,
    router2,
    onR2Render,
  }: {
    router1: Router;
    router2: Router;
    onR2Render?: () => void;
  } = $props();
</script>

<RouterProvider router={router1}>
  <RouterProvider router={router2}>
    {#if onR2Render}
      <StressConsumer nodeName="" onRender={onR2Render} />
    {:else}
      <StressConsumer nodeName="" />
    {/if}
  </RouterProvider>
</RouterProvider>
