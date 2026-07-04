<script lang="ts">
  // mateo passes the matched route as the `route` prop; with no querystring matcher
  // configured, the inbound URL's parsed query lands in
  // route.result.querystring.params ({ k1: "v1", ..., kN: "vN" }). Read EVERY value
  // via readSearch (checksum forces materialization). `stats` is $derived, so it
  // recomputes across navigations.
  import { readSearch } from "../../../_shared/search-param-spec";

  let { route } = $props();
  const stats = $derived(
    readSearch(Object.entries(route.result.querystring.params ?? {})),
  );
</script>

<main data-testid="page-search" data-count={stats.count}>
  {stats.count} search · Σ{stats.checksum}
</main>
