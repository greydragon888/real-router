<script lang="ts">
  import {
    Router,
    route as routeAction,
    type RouteConfig,
  } from "@mateothegreat/svelte5-router";

  import Home from "../../../_shared/Home.svelte";
  import { SEARCH_COUNTS, searchQuery } from "../../../_shared/search-param-spec";
  import SearchLeaf from "./SearchLeaf.svelte";

  // Query is NOT part of the route path in mateo — routes are plain `/sN`. With no
  // `querystring` matcher configured on a route, mateo attaches the inbound URL's
  // parsed query to the matched result as `route.result.querystring.params`
  // (condition "permitted-no-conditions"). Plain `/sN` paths carry no regex syntax
  // (regexp.can === false) so they match by exact string; `/s1` cannot prefix-match
  // `/s10` (mateo's base-match guards with `(/|$)`), so exactly one route matches.
  const routes: RouteConfig[] = [
    { path: "/", component: Home },
    ...SEARCH_COUNTS.map((n) => ({ path: `/s${n}`, component: SearchLeaf })),
  ];
</script>

<nav>
  {#each SEARCH_COUNTS as n (n)}
    <a
      href={`/s${n}?${searchQuery(n)}`}
      use:routeAction
      data-testid={`link-search-${n}`}
    >
      {n}
    </a>
  {/each}
</nav>
<Router {routes} />
