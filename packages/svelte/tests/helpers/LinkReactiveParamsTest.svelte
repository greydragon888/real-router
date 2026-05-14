<script lang="ts">
  import Link from "../../src/components/Link.svelte";

  import type { Params } from "@real-router/core";

  let {
    initialParams,
  }: {
    initialParams: Params;
  } = $props();

  let currentParams = $state<Params>(initialParams);

  // Probe for §8.2 row 3: switch the Link's `routeParams` prop reactively
  // after mount. The test calls `swap()` to switch params; the test then
  // inspects the active class to verify whether Link's active state tracks
  // the new params or stays bound to the initial value.
  export function swap(next: Params): void {
    currentParams = next;
  }
</script>

<Link routeName="users.view" routeParams={currentParams} activeClassName="active">
  Link
</Link>
