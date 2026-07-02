<script lang="ts">
  import { Router } from "sv-router";

  import { paramPath, PARAM_COUNTS } from "../../../_shared/param-spec";
  import "./router";
</script>

<nav>
  {#each PARAM_COUNTS as n (n)}
    <a href={paramPath(n)} data-testid={`link-param-${n}`}>{n}</a>
  {/each}
</nav>
<Router />
