<script lang="ts">
  // _baseline linkbuild — 1000 plain <a>, NO router Link (href is a literal
  // string, no reverse-matcher). The FLOOR for link-build: raw <a> render cost.
  const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
  const COUNT = _n > 0 ? _n : 1000;
  let show = $state(false);
  const items = Array.from({ length: COUNT }, (_, i) => i);
</script>

<button data-testid="mount-links" onclick={() => (show = true)}>mount</button>
<main data-testid="page-ready">{show ? "shown" : "idle"}</main>
{#if show}
  <nav>
    {#each items as i (i)}
      <a href={`/r${i}`} data-testid={i === COUNT - 1 ? "last-link" : undefined}>r{i}</a>
    {/each}
  </nav>
{/if}
