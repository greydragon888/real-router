<script lang="ts">
  // Click "mount-links" to mount 1000 <a> at once; the harness measures the
  // ScriptDuration of that mount (1000 p() href builds + link renders). The last
  // link carries data-testid="last-link" so the driver knows the batch is done.
  import { Router } from "sv-router";

  import { p } from "./router";

  const _n = Number(new URLSearchParams(globalThis.location?.search ?? "").get("n"));
  const COUNT = _n > 0 ? _n : 1000;
  const items = Array.from({ length: COUNT }, (_, i) => i);
  let show = $state(false);
</script>

<button data-testid="mount-links" onclick={() => (show = true)}>mount</button>
<main data-testid="page-ready">{show ? "shown" : "idle"}</main>
{#if show}
  <nav>
    {#each items as i (i)}
      <a
        href={p(`/r${i}` as `/r${number}`)}
        data-testid={i === COUNT - 1 ? "last-link" : undefined}
      >
        r{i}
      </a>
    {/each}
  </nav>
{/if}
<Router />
