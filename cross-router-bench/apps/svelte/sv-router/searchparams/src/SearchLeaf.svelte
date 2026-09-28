<script lang="ts">
  // Read the reactive query object (route.search) for the current route and report
  // count + checksum (readSearch reads EVERY value → materialization). `stats` is
  // $derived, so it recomputes across navigations.
  import { readSearch } from "../../../_shared/search-param-spec";
  import { route } from "./router";

  const stats = $derived(readSearch(Object.entries(route.search)));
</script>

<main data-testid="page-search" data-count={stats.count}>
  {stats.count} search · Σ{stats.checksum}
</main>
