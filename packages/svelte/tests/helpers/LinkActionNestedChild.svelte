<script lang="ts">
  import { createLinkAction } from "../../src/actions/link.svelte";

  // A `use:link` anchor wrapping a child element — used to assert the delegated
  // handler walks up from a descendant target to the registered link (#1253).
  let { name }: { name: string } = $props();

  const link = createLinkAction();
</script>

<a use:link={{ name }} data-testid="nested-link">
  <span data-testid="child">child</span>
</a>
