<script lang="ts">
  import { createLinkAction } from "../../src/actions/link.svelte";

  // Mounts N `use:link` anchors sharing one createLinkAction factory — used to
  // assert event delegation (#1253): N nodes register ZERO per-node listeners.
  let { count }: { count: number } = $props();

  const link = createLinkAction();
  const items = Array.from({ length: count }, (_, i) => i);
</script>

{#each items as i (i)}
  <a use:link={{ name: "home" }} data-testid={`la-${i}`}>Link {i}</a>
{/each}
