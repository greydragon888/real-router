<script lang="ts">
  import { Router } from "sv-router";

  import { WIDE_TARGETS } from "../../../_shared/wide-spec";
  // Side-effect import: evaluates router.ts so createRouter runs before <Router/>.
  import "./router";
</script>

<nav>
  {#each WIDE_TARGETS as n (n)}
    <a href={`/catalog/item-${n}`} data-testid={`link-item-${n}`}>Item {n}</a>
  {/each}
</nav>
<Router />
