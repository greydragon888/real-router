<script lang="ts">
  import {
    Router,
    route as routeAction,
    type RouteConfig,
  } from "@mateothegreat/svelte5-router";

  import CatalogItem from "../../../_shared/CatalogItem.svelte";

  // Shared layout (the div.sec + nav) lives OUTSIDE the router, so it is REUSED
  // across the a↔b switch — only the basePath="/sec" router's leaf re-keys and
  // swaps (page-item n=a ↔ n=b). Genuine partial re-render, the reuse axis
  // nested-switch measures.
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
