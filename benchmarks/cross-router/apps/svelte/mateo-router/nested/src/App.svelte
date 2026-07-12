<script lang="ts">
  import {
    Router,
    route as routeAction,
    type RouteConfig,
  } from "@mateothegreat/svelte5-router";

  import CatalogItem from "../../../_shared/CatalogItem.svelte";

  // N/A for the nested-switch matrix (#1456), skipped via run-all KNOWN_NA. This is a
  // FLAT one-level config: the layout lives OUTSIDE the router and there is no outer
  // router managing home↔section, so it measures LESS work than the other cohorts'
  // two-level cells. A faithful two-level mateo app is INEXPRESSIBLE — its <Router>
  // renders through `{#key result.path.original}` (the full evaluated URL, per its
  // route.svelte.d.ts), so an outer router would REMOUNT the layout + inner router on
  // every /sec/a↔/sec/b switch (full-remount, not the ancestor-REUSE nested-switch
  // measures). Kept for reference; mateo is exercised by the base scenarios elsewhere.
  const secRoutes: RouteConfig[] = [
    { path: "/a", component: CatalogItem, props: { n: "a" } },
    { path: "/b", component: CatalogItem, props: { n: "b" } },
  ];
</script>

<div class="sec">
  <nav>
    <a href="/sec/a" use:routeAction data-testid="link-sec-a">A</a>
    <a href="/sec/b" use:routeAction data-testid="link-sec-b">B</a>
  </nav>
  <Router basePath="/sec" routes={secRoutes} />
</div>
