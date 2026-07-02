<script lang="ts">
  // useRoute() must be called in a CHILD of RouterProvider (context is set by the
  // provider). A single name-parsing branch renders the 1000-route table — no
  // 1000 named snippets. `route.current` is reactive; reading it in the template
  // re-evaluates the branch across navigations.
  import { Link, useRoute } from "@real-router/svelte";

  import CatalogItem from "../../../_shared/CatalogItem.svelte";
  import Home from "../../../_shared/Home.svelte";
  import { WIDE_TARGETS } from "../../../_shared/wide-spec";

  const { route } = useRoute();
</script>

<nav>
  {#each WIDE_TARGETS as n (n)}
    <Link routeName={`item${n}`} data-testid={`link-item-${n}`}>Item {n}</Link>
  {/each}
</nav>
{#if route.current.name.startsWith("item")}
  <CatalogItem n={route.current.name.slice(4)} />
{:else}
  <Home />
{/if}
