<script lang="ts">
  // Shared layout for the /sec subtree. Stays mounted across a<->b switches;
  // only the inner RouteView segment snippet (a/b) swaps. The leaf reuses the
  // shared CatalogItem page (data-testid="page-item", data-n = section name).
  import { Link, RouteView } from "@real-router/svelte";

  import CatalogItem from "../../../_shared/CatalogItem.svelte";
</script>

<div class="sec">
  <nav>
    <Link routeName="sec.a" data-testid="link-sec-a">A</Link>
    <Link routeName="sec.b" data-testid="link-sec-b">B</Link>
  </nav>
  <RouteView nodeName="sec">
    {#snippet a()}
      <CatalogItem n="a" />
    {/snippet}
    {#snippet b()}
      <CatalogItem n="b" />
    {/snippet}
  </RouteView>
</div>
