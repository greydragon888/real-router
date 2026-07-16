<script lang="ts">
  import { RouterProvider } from "@real-router/svelte";

  import App from "./App.svelte";

  import type { Router } from "@real-router/core";

  let { router }: { router: Router } = $props();
</script>

<RouterProvider {router}>
  <App />
</RouterProvider>
