<script lang="ts">
  import {
    Router,
    route as routeAction,
    type RouteConfig,
  } from "@mateothegreat/svelte5-router";

  import CatalogItem from "../../../_shared/CatalogItem.svelte";
  import Home from "../../../_shared/Home.svelte";
  import { WIDE_TARGETS, wideItems } from "../../../_shared/wide-spec";

  // 1000 flat static routes (plain strings → matched by exact/base, NOT regex:
  // regexp.can() ignores digits/hyphens). Each carries its own `n` via the
  // RouteConfig `props` field, which <Router> spreads into the component. This
  // is the O(N) route table wide-config's matcher-scaling sweep measures.
  const routes: RouteConfig[] = [
    { path: "/", component: Home },
    ...wideItems.map((n) => ({
      path: `/catalog/item-${n}`,
      component: CatalogItem,
      props: { n: String(n) },
    })),
  ];
</script>

<nav>
  {#each WIDE_TARGETS as n (n)}
    <a href={`/catalog/item-${n}`} use:routeAction data-testid={`link-item-${n}`}>
      Item {n}
    </a>
  {/each}
</nav>
<Router {routes} />
