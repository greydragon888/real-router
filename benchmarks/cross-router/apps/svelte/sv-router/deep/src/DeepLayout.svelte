<script lang="ts">
  // One layout per nesting level — renders its children so the D nested layouts
  // compose into a chain (the nested-layout composition cost deep-config measures).
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="lvl">{@render children()}</div>
