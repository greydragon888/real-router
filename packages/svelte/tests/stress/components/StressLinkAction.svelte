<script lang="ts">
  import { createLinkAction } from "../../../src/actions/link.svelte";

  let {
    routeName,
    testId,
  }: {
    routeName: string;
    testId: string;
  } = $props();

  const link = createLinkAction();
</script>

<div use:link={{ name: routeName }} data-testid={testId}>
  Action {testId}
</div>
