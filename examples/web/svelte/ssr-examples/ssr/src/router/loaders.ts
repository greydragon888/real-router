import {
  LoaderNotFound,
  LoaderRedirect,
  withTimeout,
} from "@real-router/ssr-data-plugin/errors";

import { database } from "../database";

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
const SLOW_LOADER_TIMEOUT_MS = 250;
const SLOW_FETCH_URL = "http://localhost:3013/__bench/slow-fetch";

export const loaders: DataLoaderFactoryMap = {
  users: () => ({ search }) => {
    const sort: "asc" | "desc" = search.sort === "desc" ? "desc" : "asc";

    return Promise.resolve<UsersListData>({
      users: database.users.list(sort),
      sort,
    });
  },

  "users.profile": () => ({ params }) =>
    withTimeout("users.profile", PROFILE_TIMEOUT_MS, () => {
      const id = params.id as string;
      const user = database.users.findById(id);

      if (!user) {
        throw new LoaderNotFound(`user:${id}`);
      }

      return Promise.resolve<UserProfileData>({ user });
    }),

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

  legacyUser: () => ({ params }) => {
    const id = params.id as string;

    throw new LoaderRedirect(`/users/${id}`, 301);
  },

  // The `slow` loader makes a real HTTP fetch to /__bench/slow-fetch,
  // which is instrumented to count client-side aborts (server/index.ts).
  // The composed AbortSignal from withTimeout (#598) fires on the 250 ms
  // deadline OR on client disconnect (upstreamSignal from per-request
  // deps), and `fetch(..., { signal })` propagates the abort to the
  // network layer — the e2e test asserts that the bench counter ticks
  // up when the deadline elapses, proving fetch is actually cancelled.
  slow: (_router, getDep) => () => {
    const upstreamSignal = (
      getDep as unknown as (key: string) => AbortSignal | undefined
    )("abortSignal");

    return withTimeout(
      "slow",
      SLOW_LOADER_TIMEOUT_MS,
      async ({ signal }) => {
        const response = await fetch(SLOW_FETCH_URL, { signal });
        return (await response.json()) as SlowData;
      },
      { upstreamSignal },
    );
  },

  boom: () => () => Promise.reject(new Error("Loader exploded for /boom")),

  // Per-route SSR mode (#597): `ssr: false` aliases to `"client-only"`.
  // Server skips this entry's loader; mode marker travels via __SSR_STATE__.
  widget: { ssr: false },
};
