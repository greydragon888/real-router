<script lang="ts">
  import { createLinkAction } from "../../src/actions/link.svelte";
  import type { LinkActionParams } from "../../src/actions/link.svelte";
  import type { Snippet } from "svelte";

  let { params, children }: { params: LinkActionParams; children?: Snippet } = $props();

  const link = createLinkAction();
</script>

<button use:link={params}>
  {@render children?.()}
</button>
