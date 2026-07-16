<script lang="ts">
  import { useRoute } from "@real-router/svelte";

  let { index }: { index: number } = $props();

  const ctx = useRoute();
  const name = $derived(ctx.route.current.name);
</script>

<span data-i={index} data-route={name}>{index}</span>
