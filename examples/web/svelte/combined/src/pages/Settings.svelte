<script lang="ts">
  import { store } from "../../../../shared/store";

  let displayName = $state("");

  $effect(() => {
    store.set("settings:unsaved", displayName !== "");
    return () => { store.set("settings:unsaved", false); };
  });
</script>

<div>
  <h1>Settings</h1>
  <div class="card">
    <div class="form-group">
      <label>Display Name</label>
      <input value={displayName} oninput={(e) => { displayName = e.currentTarget.value; }} placeholder="Enter your display name…" />
    </div>
    {#if displayName}
      <p style="color: #c62828; font-size: 14px">Unsaved changes — navigating away triggers <code>canDeactivate</code>.</p>
    {/if}
    <button class="primary" style="margin-top: 8px">Save</button>
  </div>
</div>
