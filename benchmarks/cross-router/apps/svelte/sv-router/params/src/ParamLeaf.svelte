<script lang="ts">
  // Count the k-params the matcher extracted for the current route (data-count).
  import { route } from "./router";

  const count = $derived(
    Object.keys(route.params).filter((k) => /^k\d+$/.test(k)).length,
  );
</script>

<main data-testid="page-param" data-count={count}>{count} params</main>
