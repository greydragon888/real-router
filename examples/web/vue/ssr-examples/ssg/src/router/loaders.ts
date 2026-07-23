import { LoaderNotFound } from "@real-router/ssr-data-plugin/errors";

import { database } from "../database";

import type { Post, User } from "../database";
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

export interface UsersListData {
  users: readonly User[];
}

export interface UserProfileData {
  user: User;
}

export interface UserPostsData {
  user: User;
  posts: readonly Post[];
}

export const loaders: DataLoaderFactoryMap = {
  users: () => () =>
    Promise.resolve<UsersListData>({
      users: database.users.list(),
    }),

  "users.profile": () => ({ params }) => {
    const id = params.id as string;
    const user = database.users.findById(id);

    if (!user) {
      // Throws at build time — ssg-build.ts catches and counts the
      // url as a failure. Prevents silently emitting "user not found"
      // pages for ids in entries.ts that no longer exist in the
      // database.
      throw new LoaderNotFound(`user:${id}`);
    }

    return Promise.resolve<UserProfileData>({ user });
  },

  // Leaf loader for the nested /users/:id/posts route. Re-validates
  // the parent user (catches stale entries.ts ids that point at
  // missing parents). Charlie ("3") has no posts → empty array
  // exercises the empty-state UI in UserPosts.vue.
  "users.profile.posts": () => ({ params }) => {
    const id = params.id as string;
    const user = database.users.findById(id);

    if (!user) {
      throw new LoaderNotFound(`user:${id}`);
    }

    return Promise.resolve<UserPostsData>({
      user,
      posts: database.posts.listByAuthor(id),
    });
  },
};
