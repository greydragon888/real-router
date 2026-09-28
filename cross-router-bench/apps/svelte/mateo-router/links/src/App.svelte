<script lang="ts">
  import {
    Router,
    route as routeAction,
    type RouteConfig,
  } from "@mateothegreat/svelte5-router";

  import Home from "../../../_shared/Home.svelte";
  import { tabs } from "../../../_shared/links-spec";
  import TabPage from "./TabPage.svelte";

  // 100 sibling /tab/i routes (plain strings). Each <a use:routeAction={{active}}>
  // installs its own pushState listener that recomputes/toggles its active class
  // on every navigation → the O(links) active-state recompute active-links measures.
  const routes: RouteConfig[] = [
    { path: "/", component: Home },
    ...tabs.map((i) => ({
      path: `/tab/${i}`,
      component: TabPage,
      props: { n: String(i) },
    })),
  ];
</script>

<nav>
  {#each tabs as i (i)}
    <a
      href={`/tab/${i}`}
      use:routeAction={{ active: { class: "active" } }}
      data-testid={`link-tab-${i}`}
    >
      Tab {i}
    </a>
  {/each}
</nav>
<Router {routes} />
