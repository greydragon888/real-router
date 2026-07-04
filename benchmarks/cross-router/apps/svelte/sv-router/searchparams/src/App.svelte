<script lang="ts">
  import { Router } from "sv-router";

  import { SEARCH_COUNTS, searchQuery } from "../../../_shared/search-param-spec";
  import "./router";
</script>

<nav>
  {#each SEARCH_COUNTS as n (n)}
    <a href={`/s${n}?${searchQuery(n)}`} data-testid={`link-search-${n}`}>{n}</a>
  {/each}
</nav>
<Router />
