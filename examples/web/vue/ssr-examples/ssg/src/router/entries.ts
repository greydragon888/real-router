import { database } from "../database";

// Dynamic-route parameter sets for SSG pre-rendering. getStaticPaths()
// in entry-server.ts walks the router tree, finds leaf routes, and
// substitutes these param maps into each :id placeholder. Both the
// users.profile and users.profile.posts leaves consume the same id
// set — same source of truth, no duplication.
//
// Overfetch protection: only ids listed here get pre-rendered. If
// the database holds an id that's not in this map, no static HTML
// is emitted for it (and no /users/<id>/posts/index.html either).
// The e2e suite verifies this contract by walking dist/.
const userIds = (): Promise<Record<string, string>[]> =>
  Promise.resolve(database.users.allIds().map((id) => ({ id })));

export const entries: Record<string, () => Promise<Record<string, string>[]>> = {
  "users.profile": userIds,
  "users.profile.posts": userIds,
};
