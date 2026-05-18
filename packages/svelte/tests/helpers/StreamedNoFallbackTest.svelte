<script lang="ts">
  import Streamed from "../../src/components/Streamed.svelte";

  interface Props {
    pending: Promise<string>;
  }

  let { pending }: Props = $props();
</script>

<Streamed {pending}>
  {#snippet children(value: string)}
    <span data-testid="resolved">{value}</span>
  {/snippet}
</Streamed>
