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

// Leaf-route loader for /users/:id/posts: ssr-data-plugin matches loaders
// by exact state.name and rewrites state.context.data on each transition,
// so the leaf loader owns the entire shape. Combine parent (user) + child
// (posts) data into one return so UserProfile and UserPosts both render
// from a single context.data write — this is the recommended pattern for
// "nested loaders" when sticking to a single ssr-data-plugin namespace.
export interface UserPostsData {
  user: User;
  posts: readonly Post[];
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

  // Intentional throw — verifies that loader rejections propagate through
  // router.start(), bypass partial render, and let entry-server.tsx
  // translate the error into a 500 response with an error page.
  boom: () => () => Promise.reject(new Error("Loader exploded for /boom")),

  // The `slow` loader pulls an `abortSignal` from per-request deps and
  // races against a 250 ms withTimeout — for full requests (no abort)
  // the timeout wins and surfaces as 504 Gateway Timeout. For client-
  // disconnect requests, the signal aborts first and the loader cleans
  // up its setTimeout (no leak).
  slow: (_router, getDep) => () =>
    withTimeout("slow", SLOW_LOADER_TIMEOUT_MS, () => {
      const signal = (
        getDep as unknown as (key: string) => AbortSignal | undefined
      )("abortSignal");

      return new Promise<{ message: string }>((resolve, reject) => {
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
    }),
};
