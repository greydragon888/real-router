import { database } from "../database";

export const entries: Record<string, () => Promise<Record<string, string>[]>> =
  {
    "users.profile": () =>
      Promise.resolve(database.users.allIds().map((id) => ({ id }))),
  };
