<script lang="ts">
  import { createLinkAction } from "../../src/actions/link.svelte";
  import type { LinkActionParams } from "../../src/actions/link.svelte";

  let { params1, params2 }: { params1: LinkActionParams; params2: LinkActionParams } = $props();

  const link1 = createLinkAction();
  const link2 = createLinkAction();
</script>

<button data-testid="btn1" use:link1={params1}>Button 1</button>
<button data-testid="btn2" use:link2={params2}>Button 2</button>
