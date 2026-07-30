import { database } from "../database";

import type { StaticPathEntries } from "@real-router/ssr-utils";

export const entries: StaticPathEntries = {
  "users.profile": () =>
    Promise.resolve(database.users.allIds().map((id) => ({ params: { id } }))),
  // Nested route — same params as the parent. SSG generates one
  // /users/<id>/posts/index.html per declared user.
  "users.profile.posts": () =>
    Promise.resolve(database.users.allIds().map((id) => ({ params: { id } }))),
};
