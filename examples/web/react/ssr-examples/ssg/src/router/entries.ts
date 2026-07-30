import { database } from "../database";

import type {
  StaticPathEntries,
  StaticPathEntry,
} from "@real-router/ssr-utils";

// Same id set for both leaves — single source of truth.
const userIds = (): Promise<StaticPathEntry[]> =>
  Promise.resolve(database.users.allIds().map((id) => ({ params: { id } })));

export const entries: StaticPathEntries = {
  "users.profile": userIds,
  "users.profile.posts": userIds,
};
