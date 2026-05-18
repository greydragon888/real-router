import { useRoute } from "@real-router/react";

import type { UserPostsData } from "../router/loaders";
import type { JSX } from "react";

export function UserPosts(): JSX.Element {
  const { route } = useRoute();
  const data = route.context.data as UserPostsData | undefined;

  if (!data) {
    return <p>Loading…</p>;
  }

  if (data.posts.length === 0) {
    return (
      <div data-testid="user-posts-empty">
        <h3>Posts</h3>
        <p>No posts yet.</p>
      </div>
    );
  }

  return (
    <div data-testid="user-posts">
      <h3>Posts</h3>
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
