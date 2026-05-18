<script lang="ts">
  import { useRoute } from "@real-router/svelte";

  import type { UserPostsData } from "../router/loaders";

  const { route } = useRoute();
  const data = $derived(
    route.current.context.data as UserPostsData | undefined,
  );
</script>

{#if !data}
  <p>Loading…</p>
{:else if data.posts.length === 0}
  <div data-testid="user-posts-empty">
    <h3>Posts</h3>
    <p>No posts yet.</p>
  </div>
{:else}
  <div data-testid="user-posts">
    <h3>Posts ({data.posts.length})</h3>
    <ul>
      {#each data.posts as post (post.id)}
        <li data-post-id={post.id}>{post.title}</li>
      {/each}
    </ul>
  </div>
{/if}
