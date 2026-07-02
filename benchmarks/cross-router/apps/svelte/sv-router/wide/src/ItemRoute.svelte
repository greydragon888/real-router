<script lang="ts">
  // The item number is not a path param (routes are static /catalog/item-N), so
  // recover it from the reactive pathname — one wrapper serves all 1000 routes.
  import CatalogItem from "../../../_shared/CatalogItem.svelte";
  import { route } from "./router";

  const n = $derived(route.pathname.replace("/catalog/item-", ""));
</script>

<CatalogItem {n} />
