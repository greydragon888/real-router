<script lang="ts">
  import RouterProvider from "../../src/RouterProvider.svelte";

  import type { Router } from "@real-router/core";
  import type { Snippet } from "svelte";

  let { router, children }: { router: Router; children: Snippet } = $props();
</script>

<RouterProvider {router}>
  {@render children()}
</RouterProvider>
