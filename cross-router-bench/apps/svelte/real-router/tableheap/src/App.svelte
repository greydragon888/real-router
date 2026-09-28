<script lang="ts">
  import { RouterProvider } from "@real-router/svelte";
  import type { Router } from "@real-router/core";

  import Content from "./Content.svelte";

  let { router, n }: { router: Router; n: number } = $props();
</script>

<RouterProvider {router}>
  <Content {n} />
</RouterProvider>
