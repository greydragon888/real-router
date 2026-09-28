<script lang="ts">
  import { Link, RouteView, RouterProvider } from "@real-router/svelte";
  import type { Router } from "@real-router/core";

  import { DEEP_TARGETS, deepName } from "../../../_shared/deep-spec";
  import Level from "./Level.svelte";

  let { router }: { router: Router } = $props();
</script>

<RouterProvider {router}>
  <RouteView nodeName="">
    {#snippet home()}
      <nav>
        {#each DEEP_TARGETS as d (d)}
          <Link routeName={deepName(d)} data-testid={`link-deep-${d}`}>
            Depth {d}
          </Link>
        {/each}
      </nav>
    {/snippet}
    {#snippet deep()}
      <RouteView nodeName="deep">
        {#snippet l1()}
          <Level k={1} name="deep.l1" />
        {/snippet}
      </RouteView>
    {/snippet}
  </RouteView>
</RouterProvider>
