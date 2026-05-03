import { HomePage } from "../server-components/HomePage";
import { UserProfile } from "../server-components/UserProfile";
import { UsersList } from "../server-components/UsersList";

import type { AppDependencies } from "./createAppRouter";
import type { RscLoaderFactoryMap } from "@real-router/rsc-server-plugin";

export const loaders: RscLoaderFactoryMap<AppDependencies> = {
  home: () => () => <HomePage />,
  "users.list": () => () => <UsersList />,
  "users.profile": (_router, getDep) => async (params) => {
    const database = getDep("db");
    const id = params.id as string;
    const user = await database.users.findById(id);

    return <UserProfile user={user} />;
  },
};
