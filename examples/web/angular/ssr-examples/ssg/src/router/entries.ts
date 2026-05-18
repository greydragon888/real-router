import { database } from "../database";

export const entries: Record<string, () => Promise<Record<string, string>[]>> =
  {
    "users.profile": () =>
      Promise.resolve(database.users.allIds().map((id) => ({ id }))),
    // Nested route — same params as the parent. SSG generates one
    // /users/<id>/posts/index.html per declared user.
    "users.profile.posts": () =>
      Promise.resolve(database.users.allIds().map((id) => ({ id }))),
  };
