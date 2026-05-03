import { database } from "../database";

import type { Post, User } from "../database";
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

export interface UsersListData {
  users: readonly User[];
  sort: "asc" | "desc";
}

export interface UserProfileData {
  user: User | undefined;
}

// Leaf-route loader for /users/:id/posts: ssr-data-plugin matches loaders
// by exact state.name and rewrites state.context.data on each transition,
// so the leaf loader owns the entire shape. Combine parent (user) + child
// (posts) data into one return so UserProfile and UserPosts both render
// from a single context.data write — this is the recommended pattern for
// "nested loaders" when sticking to a single ssr-data-plugin namespace.
export interface UserPostsData {
  user: User | undefined;
  posts: readonly Post[];
}

export const loaders: DataLoaderFactoryMap = {
  users: () => (params) => {
    const sort: "asc" | "desc" = params.sort === "desc" ? "desc" : "asc";

    return Promise.resolve<UsersListData>({
      users: database.users.list(sort),
      sort,
    });
  },
  "users.profile": () => (params) =>
    Promise.resolve<UserProfileData>({
      user: database.users.findById(params.id as string),
    }),
  "users.profile.posts": () => (params) => {
    const id = params.id as string;

    return Promise.resolve<UserPostsData>({
      user: database.users.findById(id),
      posts: database.posts.listByAuthor(id),
    });
  },
  // Intentional throw — verifies that loader rejections propagate through
  // router.start(), bypass partial render, and let entry-server.tsx
  // translate the error into a 500 response with an error page.
  boom: () => () => Promise.reject(new Error("Loader exploded for /boom")),
};
