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
  boom: () => () => Promise.reject(new Error("Loader exploded for /boom")),
};
