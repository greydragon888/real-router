<script lang="ts">
  import { useRoute, useNavigator } from "@real-router/svelte";
  import { store } from "../../../../shared/store";
  import type { User } from "../../../../shared/api";

  let { onLogout }: { onLogout: () => Promise<void> } = $props();

  const { route } = useRoute();
  const navigator = useNavigator();

  let user = $state(store.get("user") as User | null);
  $effect(() => {
    return store.subscribe(() => { user = store.get("user") as User | null; });
  });

  const lang = $derived((route.current?.params.lang as string | undefined) ?? "en");
</script>

<div>
  <h1>Dashboard</h1>
  {#if user}
    <div class="card">
      <p><strong>Logged in as:</strong> {user.name}</p>
      <p><strong>Role:</strong> {user.role}</p>
      <p><strong>Lang param:</strong> {lang}</p>
    </div>
  {/if}
  <div style="display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap">
    <button onclick={() => void navigator.navigate(route.current?.name ?? "dashboard", { ...route.current?.params, lang: lang === "en" ? "ru" : "en" }, { reload: true })}>
      Toggle lang ({lang === "en" ? "→ RU" : "→ EN"})
    </button>
    <button class="danger" onclick={() => void onLogout()}>Logout</button>
  </div>
  <p style="margin-top: 16px; font-size: 14px; color: #888">
    This page loads lazily — chunk loaded on first visit.
  </p>
</div>
