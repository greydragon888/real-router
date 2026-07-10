<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  // Mount/destroy counter shared with the test. A remount (F3 violation) shows
  // up as `mounts === 2` / `destroys === 1` after an in-winner navigation.
  let { probe }: { probe: { mounts: number; destroys: number } } = $props();

  onMount(() => {
    probe.mounts += 1;
  });

  onDestroy(() => {
    probe.destroys += 1;
  });
</script>

<div data-testid="probe">Probe</div>
