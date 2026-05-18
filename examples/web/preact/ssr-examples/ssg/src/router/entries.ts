import { database } from "../database";

// Same id set for both leaves — single source of truth.
const userIds = (): Promise<Record<string, string>[]> =>
  Promise.resolve(database.users.allIds().map((id) => ({ id })));

export const entries: Record<string, () => Promise<Record<string, string>[]>> =
  {
    "users.profile": userIds,
    "users.profile.posts": userIds,
  };
