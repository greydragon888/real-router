import type { State } from "@real-router/core";

export { createMockedBrowser } from "./mockPlugins";

export const noop = (): void => undefined;

export const routerConfig = [
  {
    name: "users",
    path: "/users",
    children: [
      { name: "view", path: "/view/:id" },
      // `?page&sort` are DECLARED (#1575): the query-source-of-truth suites
      // (inner hash vs outer search) assert on these keys, and under
      // `queryParamsMode: "default"` an undeclared key no longer becomes state —
      // which would turn those assertions into `{} === {}` tautologies that can
      // no longer tell the two sources apart. Declaring them keeps the subject
      // of those tests testable.
      { name: "list", path: "/list?page&sort" },
    ],
  },
  { name: "home", path: "/home" },
  { name: "index", path: "/" },
];

export const withoutMeta = (
  state: State,
): {
  name: string;
  params: Record<string, unknown>;
  path: string;
} => ({
  name: state.name,
  params: state.params,
  path: state.path,
});
