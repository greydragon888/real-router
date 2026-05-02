import type { RscLoaderFactoryMap } from "@real-router/rsc-server-plugin";

import { HomePage } from "../server-components/HomePage";
import { UsersList } from "../server-components/UsersList";
import { UserProfile } from "../server-components/UserProfile";

import type { AppDependencies } from "./createAppRouter";

export const loaders: RscLoaderFactoryMap<AppDependencies> = {
  home: () => () => <HomePage />,
  "users.list": () => async () => <UsersList />,
  "users.profile": (_router, getDep) => async (params) => {
    const db = getDep("db");
    const user = await db.users.findById(String(params.id));
    return <UserProfile user={user} />;
  },
};
