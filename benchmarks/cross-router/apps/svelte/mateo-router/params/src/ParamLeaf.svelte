<script lang="ts">
  // mateo passes the matched route as the `route` prop; the regex's named groups
  // land in route.result.path.params. Count the kN keys to report how many params
  // the matcher extracted.
  let { route } = $props();
  const count = $derived(
    Object.keys(route.result.path.params ?? {}).filter((k) => /^k\d+$/.test(k))
      .length,
  );
</script>

<main data-testid="page-param" data-count={count}>{count} params</main>
