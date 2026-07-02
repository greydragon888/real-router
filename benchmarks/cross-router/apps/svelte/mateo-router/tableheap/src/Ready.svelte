<script lang="ts">
  let { n }: { n: string } = $props();
</script>

<main data-testid="page-ready" data-n={n}>ready {n}</main>
