import { database } from "../database";

import type { Post, User } from "../database";
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

export interface UsersListData {
  users: readonly User[];
}

export interface UserProfileData {
  user: User | undefined;
}

export interface UserPostsData {
  user: User | undefined;
  posts: readonly Post[];
}

export const loaders: DataLoaderFactoryMap = {
  users: () => () =>
    Promise.resolve<UsersListData>({
      users: database.users.list(),
    }),
  "users.profile": () => ({ params }) =>
    Promise.resolve<UserProfileData>({
      user: database.users.findById(params.id as string),
    }),
  "users.profile.posts": () => ({ params }) => {
    const id = params.id as string;

    return Promise.resolve<UserPostsData>({
      user: database.users.findById(id),
      posts: database.posts.listByAuthor(id),
    });
  },
};
