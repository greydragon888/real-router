import { LoaderNotFound } from "@real-router/rsc-server-plugin/errors";

import { HomePage } from "../server-components/HomePage";
import { UserProfile } from "../server-components/UserProfile";
import { UsersList } from "../server-components/UsersList";

import type { AppDependencies } from "./createAppRouter";
import type { RscLoaderFactoryMap } from "@real-router/rsc-server-plugin";

export const loaders: RscLoaderFactoryMap<AppDependencies> = {
  home: () => () => <HomePage />,
  "users.list": () => ({ search }) => {
    const role =
      search.role === "admin" || search.role === "user"
        ? search.role
        : undefined;

    return <UsersList roleFilter={role} />;
  },
  "users.profile": (_router, getDep) => async ({ params }) => {
    const database = getDep("db");
    const id = params.id as string;
    const user = await database.users.findById(id);

    if (!user) {
      // Typed error so entry.rsc.tsx can map it to 404 text/plain
      // BEFORE constructing the Flight stream. Without this, an
      // unknown id surfaces as a Server Component rendering
      // `user.name` on undefined → 500 + leaked router (cleanup
      // skipped on the catch path).
      throw new LoaderNotFound(`user:${id}`);
    }

    return <UserProfile user={user} />;
  },
  // Demonstrates loader error propagation: this loader rejects, the entry
  // catches it and renders a 500 with a server-rendered error component.
  boom: () => () => Promise.reject(new Error("Loader exploded for /boom")),
};
