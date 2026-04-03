<script lang="ts">
  import { useNavigator } from "@real-router/svelte";

  import { store } from "../../../../shared/store";

  const navigator = useNavigator();
  let displayName = $state("");

  $effect(() => {
    store.set("settings:unsaved", displayName !== "");

    return () => {
      store.set("settings:unsaved", false);
    };
  });

  $effect(() => {
    return navigator.subscribeLeave(({ route }) => {
      if (route.name === "settings" && displayName) {
        localStorage.setItem("settings:draft", displayName);
      }
    });
  });
</script>

<div>
  <h1>Settings</h1>
  <div class="card">
    <div class="form-group">
      <label>Display Name</label>
      <input
        value={displayName}
        oninput={(event) => { displayName = event.currentTarget.value; }}
        placeholder="Enter your display name…"
      />
    </div>
    {#if displayName}
      <p style="color: #c62828; font-size: 14px">
        You have unsaved changes. Navigating away will trigger
        <code>canDeactivate</code> guard confirmation.
      </p>
    {/if}
    <button class="primary" style="margin-top: 8px">
      Save
    </button>
  </div>
</div>
