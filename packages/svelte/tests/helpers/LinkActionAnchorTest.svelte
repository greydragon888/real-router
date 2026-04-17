<script lang="ts">
  import { createLinkAction } from "../../src/actions/link.svelte";
  import type { LinkActionParams } from "../../src/actions/link.svelte";
  import type { Snippet } from "svelte";

  let {
    params,
    target,
    children,
  }: {
    params: LinkActionParams;
    target?: string;
    children?: Snippet;
  } = $props();

  const link = createLinkAction();
</script>

<a href="/external" {target} use:link={params}>
  {@render children?.()}
</a>
