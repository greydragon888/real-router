<script lang="ts">
  // Terminal leaf — derive the depth D from the reactive pathname
  // (/deep/l1/.../lD → count of lN segments) and render CatalogItem n=D.
  import CatalogItem from "../../../_shared/CatalogItem.svelte";
  import { route } from "./router";

  const depth = $derived(
    route.pathname.split("/").filter((s) => /^l\d+$/.test(s)).length,
  );
</script>

<CatalogItem n={String(depth)} />
