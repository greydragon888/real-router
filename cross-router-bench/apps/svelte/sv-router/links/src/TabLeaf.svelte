<script lang="ts">
  import { route } from "./router";

  const n = $derived(route.params.id ?? "");
</script>

<main data-testid="page-tab" data-n={n}>
  <h1>Tab {n}</h1>
</main>
