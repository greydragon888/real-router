<script lang="ts">
  let { n }: { n: string } = $props();
</script>

<main data-testid="page-tab" data-n={n}>
  <h1>Tab {n}</h1>
</main>
