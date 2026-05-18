<script lang="ts">
  import { Link, RouteView, useRoute } from "@real-router/svelte";

  import UserPosts from "./UserPosts.svelte";

  import type { UserProfileData } from "../router/loaders";

  const { route } = useRoute();
  const data = $derived(
    route.current.context.data as UserProfileData | undefined,
  );
</script>

{#if !data?.user}
  <div>
    <h2>User Profile</h2>
    <p data-testid="user-not-found">User not found.</p>
  </div>
{:else}
  <div data-testid="user-profile" data-user-id={data.user.id}>
    <h2>User Profile</h2>
    <p data-testid="user-id">ID: {data.user.id}</p>
    <p data-testid="user-name">Name: {data.user.name}</p>
    <p data-testid="user-role">Role: {data.user.role}</p>

    <Link
      routeName="users.profile.posts"
      routeParams={{ id: data.user.id }}
      data-testid="view-posts"
    >
      View posts
    </Link>

    <RouteView nodeName="users.profile">
      {#snippet posts()}
        <UserPosts />
      {/snippet}
    </RouteView>
  </div>
{/if}
