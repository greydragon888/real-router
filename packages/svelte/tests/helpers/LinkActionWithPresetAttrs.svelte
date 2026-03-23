<script lang="ts">
  import { createLinkAction } from "../../src/actions/link.svelte";
  import type { LinkActionParams } from "../../src/actions/link.svelte";
  import type { Snippet } from "svelte";

  let { params, children }: { params: LinkActionParams; children?: Snippet } = $props();

  const link = createLinkAction();
</script>

<div role="button" tabindex="2" use:link={params}>
  {@render children?.()}
</div>
