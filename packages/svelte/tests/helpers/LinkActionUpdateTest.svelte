<script lang="ts">
  import { createLinkAction } from "../../src/actions/link.svelte";
  import type { LinkActionParams } from "../../src/actions/link.svelte";
  import type { Snippet } from "svelte";

  let { initialParams, children }: { initialParams: LinkActionParams; children?: Snippet } = $props();

  const link = createLinkAction();

  let params = $state(initialParams);

  export function updateParams(newParams: LinkActionParams) {
    params = newParams;
  }
</script>

<button use:link={params}>
  {@render children?.()}
</button>
