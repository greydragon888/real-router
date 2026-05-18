<script lang="ts">
  import { RouterProvider } from "@real-router/svelte";

  import AppView from "./AppView.svelte";

  import type { Router } from "@real-router/core";

  const { router }: { router: Router } = $props();
</script>

<RouterProvider {router}>
  <AppView />
</RouterProvider>
