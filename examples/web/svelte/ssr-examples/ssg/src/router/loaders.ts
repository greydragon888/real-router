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
};
