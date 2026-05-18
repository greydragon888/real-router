<script lang="ts">
  import { useRoute } from "@real-router/svelte";

  interface ProfileData {
    id: string;
    name: string;
  }

  const { route } = useRoute();
  const data = $derived(route.current.context.data as ProfileData | undefined);
</script>

<main data-testid="user-profile">
  <h1>User profile (data-only)</h1>
  <p data-testid="profile-shell">
    Server fetched the data and shipped JSON; this shell renders without
    SSR'd HTML, the client hydrates from
    <code>__SSR_STATE__.context.data</code>.
  </p>
  {#if data}
    <p data-testid="profile-data">
      {data.id} — {data.name}
    </p>
  {/if}
</main>
