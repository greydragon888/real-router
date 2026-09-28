<script lang="ts">
  // Pass-through layout level — reuses its child leaf/level via {@render children()}.
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="lvl">{@render children()}</div>
