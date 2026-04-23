<script lang="ts">
  import { errorStore } from "../error-store";

  import type { ErrorEntry } from "../error-store";

  let errors = $state(errorStore.getAll() as readonly ErrorEntry[]);

  $effect(() => {
    return errorStore.subscribe(() => {
      errors = errorStore.getAll();
    });
  });
</script>

<div class="card" style="margin-top: 24px">
  <strong>onTransitionError plugin log</strong>
  {#if errors.length === 0}
    <p style="color: #888; margin-top: 8px; font-size: 13px">
      No errors yet — click the buttons above to trigger navigation errors.
    </p>
  {:else}
    <ul style="padding-left: 16px; margin-top: 8px">
      {#each errors.toReversed() as entry}
        <li style="margin-bottom: 4px; font-size: 13px">
          <strong style="color: #c62828">{entry.code}</strong>
          {#if entry.path}
            — path: {entry.path}
          {/if}
          <span style="color: #888; margin-left: 8px">
            {new Date(entry.time).toLocaleTimeString()}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
