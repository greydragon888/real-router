import { database } from "../database";

import type { User } from "../database";
import type { DataLoaderFactoryMap } from "@real-router/ssr-data-plugin";

export interface UsersListData {
  users: readonly User[];
}

export interface UserProfileData {
  user: User | undefined;
}

export const loaders: DataLoaderFactoryMap = {
  users: () => () =>
    Promise.resolve<UsersListData>({
      users: database.users.list(),
    }),
  "users.profile": () => (params) =>
    Promise.resolve<UserProfileData>({
      user: database.users.findById(params.id as string),
    }),
  // Intentional throw — verifies that loader rejections propagate through
  // router.start(), bypass partial render, and let entry-server.tsx
  // translate the error into a 500 response with an error page.
  boom: () => () => Promise.reject(new Error("Loader exploded for /boom")),
};
