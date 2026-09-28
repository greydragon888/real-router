<script lang="ts">
  // Wide/deep leaf — `data-n` lets the sweep driver confirm it reached position
  // N (flat table) or depth D (nested chain).
  let { n }: { n: string } = $props();
</script>

<main data-testid="page-item" data-n={n}>
  <h1>Item {n}</h1>
</main>
