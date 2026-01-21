import type { NavigationOptions, Params, State } from "@real-router/core";

export { createTestRouter } from "./testRouters";

export function omitMeta(obj?: State): State | undefined {
  if (!obj) {
    return;
  }

  return {
    name: obj.name,
    params: obj.params,
    path: obj.path,
  };
}

export const makeState = (
  name: string,
  params: Params = {},
  metaParams: Params = {},
  options: NavigationOptions = {},
): State => ({
  name,
  path: `/${name.replaceAll(".", "/")}`,
  params,
  meta: {
    id: 0,
    params: metaParams,
    options,
    redirected: false,
  },
});
