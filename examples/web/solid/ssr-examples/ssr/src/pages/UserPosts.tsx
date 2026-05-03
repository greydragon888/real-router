import { useRoute } from "@real-router/solid";
import { For, Show } from "solid-js";

import type { UserPostsData } from "../router/loaders";
import type { JSX } from "solid-js";

export function UserPosts(): JSX.Element {
  const routeState = useRoute();
  const data = (): UserPostsData | undefined =>
    routeState().route.context.data as UserPostsData | undefined;

  return (
    <Show when={data()} fallback={<p>Loading…</p>}>
      {(d) => (
        <Show
          when={d().posts.length > 0}
          fallback={
            <div data-testid="user-posts-empty">
              <h3>Posts</h3>
              <p>No posts yet.</p>
            </div>
          }
        >
          <div data-testid="user-posts">
            <h3>Posts</h3>
            <ul>
              <For each={d().posts}>
                {(post) => <li data-post-id={post.id}>{post.title}</li>}
              </For>
            </ul>
          </div>
        </Show>
      )}
    </Show>
  );
}
