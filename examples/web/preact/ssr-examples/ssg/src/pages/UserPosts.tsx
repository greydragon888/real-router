import { useRoute } from "@real-router/preact";

import type { UserPostsData } from "../router/loaders";
import type { JSX } from "preact";

export function UserPosts(): JSX.Element {
  const { route } = useRoute();
  const data = route.context.data as UserPostsData | undefined;

  if (!data) {
    return <p>Loading…</p>;
  }

  if (data.posts.length === 0) {
    return (
      <div data-testid="user-posts-empty">
        <h2>Posts</h2>
        <p>No posts yet.</p>
      </div>
    );
  }

  return (
    <div data-testid="user-posts">
      <h2>Posts</h2>
      <ul>
        {data.posts.map((post) => (
          <li key={post.id} data-post-id={post.id}>
            {post.title}
          </li>
        ))}
      </ul>
    </div>
  );
}
