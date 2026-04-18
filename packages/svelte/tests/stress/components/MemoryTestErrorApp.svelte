<script lang="ts">
  import RouterProvider from "../../../src/RouterProvider.svelte";
  import MemoryTestErrorBoundary from "./MemoryTestErrorBoundary.svelte";

  import type { Router } from "@real-router/core";

  let { router }: { router: Router } = $props();
</script>

<RouterProvider {router}>
  <MemoryTestErrorBoundary />
</RouterProvider>
