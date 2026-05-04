import { database } from "../database";
import {
  LoaderNotFound,
  LoaderRedirect,
  withTimeout,
} from "../_loader-errors";

import type { Post, User } from "../database";
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

export interface UsersListData {
  users: readonly User[];
  sort: "asc" | "desc";
}

export interface UserProfileData {
  user: User;
}

export interface UserPostsData {
  user: User;
  posts: readonly Post[];
}

export interface SlowData {
  message: string;
}

const PROFILE_TIMEOUT_MS = 1500;
const SLOW_LOADER_DELAY_MS = 5000;
const SLOW_LOADER_TIMEOUT_MS = 250;

export const loaders: DataLoaderFactoryMap = {
  users: () => (params) => {
    const sort: "asc" | "desc" = params.sort === "desc" ? "desc" : "asc";

    return Promise.resolve<UsersListData>({
      users: database.users.list(sort),
      sort,
    });
  },

  "users.profile": () => (params) =>
    withTimeout("users.profile", PROFILE_TIMEOUT_MS, () => {
      const id = params.id as string;
      const user = database.users.findById(id);

      if (!user) {
        throw new LoaderNotFound(`user:${id}`);
      }

      return Promise.resolve<UserProfileData>({ user });
    }),

  "users.profile.posts": () => (params) => {
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

  legacyUser: () => (params) => {
    const id = params.id as string;

    throw new LoaderRedirect(`/users/${id}`, 301);
  },

  slow: () => () =>
    withTimeout("slow", SLOW_LOADER_TIMEOUT_MS, () =>
      new Promise<SlowData>((resolve) => {
        setTimeout(() => {
          resolve({ message: "this should never be seen" });
        }, SLOW_LOADER_DELAY_MS);
      }),
    ),

  boom: () => () => Promise.reject(new Error("Loader exploded for /boom")),
};
