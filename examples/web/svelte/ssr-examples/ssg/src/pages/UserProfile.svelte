<script lang="ts">
  import { useRoute } from "@real-router/svelte";

  import type { UserProfileData } from "../router/loaders";

  const { route } = useRoute();
  const data = $derived(
    route.current.context.data as UserProfileData | undefined,
  );
</script>

{#if !data?.user}
  <div>
    <h2>User Profile</h2>
    <p>User not found.</p>
  </div>
{:else}
  <div>
    <h2>User Profile</h2>
    <p>ID: {data.user.id}</p>
    <p>Name: {data.user.name}</p>
  </div>
{/if}
