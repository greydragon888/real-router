<script lang="ts">
  import {
    Router,
    route,
    type RouteConfig,
  } from "@mateothegreat/svelte5-router";

  import { NAV } from "../../_shared/nav-meta";
  import About from "../../_shared/About.svelte";
  import Home from "../../_shared/Home.svelte";
  import UserRoute from "./UserRoute.svelte";

  // Named regex capture group `(?<id>[^/]+)` extracts the :id param.
  const routes: RouteConfig[] = [
    { path: "/", component: Home },
    { path: "/about", component: About },
    { path: "/users/(?<id>[^/]+)", component: UserRoute },
  ];
</script>

<nav>
  {#each NAV as n (n.name)}
    <a href={n.path} use:route data-testid={n.testid}>{n.label}</a>
  {/each}
</nav>
<Router {routes} />
