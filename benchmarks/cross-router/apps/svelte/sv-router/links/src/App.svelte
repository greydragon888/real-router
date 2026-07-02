<script lang="ts">
  import { isActiveLink, Router } from "sv-router";

  import { tabs } from "../../../_shared/links-spec";
  import "./router";
</script>

<nav>
  {#each tabs as i (i)}
    <a
      href={`/tab/${i}`}
      data-testid={`link-tab-${i}`}
      {@attach isActiveLink()}
    >
      Tab {i}
    </a>
  {/each}
</nav>
<Router />
