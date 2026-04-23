<script lang="ts">
  import { store } from "../../../../shared/store";

  import type { User } from "../../../../shared/api";

  let { onLogout }: { onLogout: () => Promise<void> } = $props();

  let user = $state(store.get("user") as User | null);

  $effect(() => {
    return store.subscribe(() => {
      user = store.get("user") as User | null;
    });
  });
</script>

<div>
  <h1>Dashboard</h1>
  {#if user}
    <div class="card">
      <p>
        <strong>Logged in as:</strong> {user.name}
      </p>
      <p>
        <strong>Role:</strong> {user.role}
      </p>
      <p>
        <strong>Email:</strong> {user.email}
      </p>
    </div>
  {/if}
  <p>
    The route tree was atomically replaced on login:
    <code>routesApi.clear() + routesApi.add(privateRoutes)</code>
  </p>
  <button
    class="danger"
    onclick={() => void onLogout()}
    style="margin-top: 16px"
  >
    Logout
  </button>
</div>
