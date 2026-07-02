<script lang="ts">
  import { Link, RouteView, RouterProvider } from "@real-router/svelte";
  import type { Router } from "@real-router/core";

  import { NAV } from "../../_shared/nav-meta";
  import About from "../../_shared/About.svelte";
  import Home from "../../_shared/Home.svelte";
  import UserRoute from "./UserRoute.svelte";

  let { router }: { router: Router } = $props();
</script>

<RouterProvider {router}>
  <nav>
    {#each NAV as n (n.name)}
      <Link routeName={n.name} data-testid={n.testid}>{n.label}</Link>
    {/each}
  </nav>
  <RouteView nodeName="">
    {#snippet home()}<Home />{/snippet}
    {#snippet about()}<About />{/snippet}
    {#snippet user()}<UserRoute />{/snippet}
  </RouteView>
</RouterProvider>
