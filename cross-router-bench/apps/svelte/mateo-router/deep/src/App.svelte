<script lang="ts">
  import {
    Router,
    route as routeAction,
    type RouteConfig,
  } from "@mateothegreat/svelte5-router";

  import Home from "../../../_shared/Home.svelte";
  import { DEEP_TARGETS, deepPath } from "../../../_shared/deep-spec";
  import DeepLevel from "./DeepLevel.svelte";

  // Top router: home + the /deep subtree. "/deep" base-matches "/deep/l1/.../ld"
  // and mounts DeepLevel(k=0), which recursively renders one nested <Router> per
  // level — the nested-layout composition deep-config's depth sweep measures.
  const routes: RouteConfig[] = [
    { path: "/", component: Home },
    { path: "/deep", component: DeepLevel, props: { k: 0, base: "/deep" } },
  ];
</script>

<nav>
  {#each DEEP_TARGETS as d (d)}
    <a href={deepPath(d)} use:routeAction data-testid={`link-deep-${d}`}>
      Depth {d}
    </a>
  {/each}
</nav>
<Router {routes} />
