<script lang="ts">
  import { Router } from "sv-router";

  import { NAV } from "../../_shared/nav-meta";
  // Side-effect import: evaluates router.ts so createRouter runs before <Router/>.
  import "./router";
</script>

<nav>
  {#each NAV as n (n.name)}
    <a href={n.path} data-testid={n.testid}>{n.label}</a>
  {/each}
</nav>
<Router />
