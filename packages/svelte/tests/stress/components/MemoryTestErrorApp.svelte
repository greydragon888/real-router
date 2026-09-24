<script lang="ts">
  import MemoryTestErrorBoundary from "./MemoryTestErrorBoundary.svelte";
  import RouterProvider from "../../../src/RouterProvider.svelte";

  import type { Router } from "@real-router/core";

  let { router }: { router: Router } = $props();
</script>

<RouterProvider {router}>
  <MemoryTestErrorBoundary />
</RouterProvider>
