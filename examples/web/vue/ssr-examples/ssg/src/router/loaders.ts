import { LoaderNotFound } from "../_loader-errors";
import { database } from "../database";

import type { User } from "../database";
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

export interface UsersListData {
  users: readonly User[];
}

export interface UserProfileData {
  user: User;
}

export const loaders: DataLoaderFactoryMap = {
  users: () => () =>
    Promise.resolve<UsersListData>({
      users: database.users.list(),
    }),

  "users.profile": () => (params) => {
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
};
