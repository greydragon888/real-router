<script lang="ts">
  import { Router } from "sv-router";

  import { deepPath, DEEP_TARGETS } from "../../../_shared/deep-spec";
  import "./router";
</script>

<nav>
  {#each DEEP_TARGETS as d (d)}
    <a href={deepPath(d)} data-testid={`link-deep-${d}`}>Depth {d}</a>
  {/each}
</nav>
<Router />
