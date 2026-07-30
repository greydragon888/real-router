<script lang="ts">
  // useRoute() in a CHILD of RouterProvider. real-router puts the declared query
  // params (searchDecl → `?k1&k2&...`) in the active route's search object; the
  // leaf reads EVERY value via readSearch (checksum forces materialization). `stats`
  // is $derived, so it recomputes across navigations.
  import { Link, useRoute } from "@real-router/svelte";

  import {
    SEARCH_COUNTS,
    searchValues,
    readSearch,
  } from "../../../_shared/search-param-spec";

  const { route } = useRoute();
  const stats = $derived(readSearch(Object.entries(route.current.search)));
</script>

<nav>
  {#each SEARCH_COUNTS as n (n)}
    <Link
      routeName={`s${n}`}
      routeSearch={searchValues(n)}
      data-testid={`link-search-${n}`}
    >
      {n}
    </Link>
  {/each}
</nav>
{#if route.current.name.startsWith("s")}
  <main data-testid="page-search" data-count={stats.count}>
    {stats.count} search · Σ{stats.checksum}
  </main>
{:else}
  <main data-testid="page-home">Home</main>
{/if}
