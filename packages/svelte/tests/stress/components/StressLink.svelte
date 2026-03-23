<script lang="ts">
  import Link from "../../../src/components/Link.svelte";

  let {
    routeName,
    activeClassName = "active",
    testId,
  }: {
    routeName: string;
    activeClassName?: string;
    testId: string;
  } = $props();
</script>

<Link {routeName} {activeClassName} data-testid={testId}>
  Link {testId}
</Link>
