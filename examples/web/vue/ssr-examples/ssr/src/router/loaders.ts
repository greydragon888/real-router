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

export interface SlowData {
  message: string;
}

const SLOW_LOADER_DELAY_MS = 5000;

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
  // The `slow` loader pulls an `abortSignal` from per-request deps
  // (registered by entry-server.ts through cloneRouter). When the
  // client disconnects mid-render, server/index.ts fires its
  // AbortController, the signal flips, and this loader cleans up the
  // setTimeout — preventing the leak that would otherwise hold the
  // server worker for the full 5 s. See README "AbortController
  // wiring" section for the full rationale.
  slow: (_router, getDep) => () => {
    const signal = (
      getDep as unknown as (key: string) => AbortSignal | undefined
    )("abortSignal");

    return new Promise<SlowData>((resolve, reject) => {
      const id = setTimeout(() => {
        resolve({ message: "this should never be seen" });
      }, SLOW_LOADER_DELAY_MS);

      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(id);
          reject(new Error("Aborted: client disconnected"));
        },
        { once: true },
      );
    });
  },
  boom: () => () => Promise.reject(new Error("Loader exploded for /boom")),
};
