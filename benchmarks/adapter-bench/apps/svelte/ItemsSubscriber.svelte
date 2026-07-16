<script lang="ts">
  import { useRouteNode } from "@real-router/svelte";

  let { index }: { index: number } = $props();

  const ctx = useRouteNode("items");
  const id = $derived(String(ctx.route.current?.params.id ?? ""));
</script>

<span data-i={index} data-id={id}>{index}</span>
