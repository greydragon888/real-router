<script lang="ts">
  // useRoute() in a CHILD of RouterProvider. Renders page-ready once the router
  // is mounted; reading route.current holds a live subscription to the router
  // (and thus its N-route table) for the retained-heap read.
  import { useRoute } from "@real-router/svelte";

  let { n }: { n: number } = $props();

  const { route } = useRoute();
</script>

<main data-testid="page-ready" data-n={String(n)}>{route.current.name}</main>
