import { DEFAULT_TRANSITION } from "../../src/constants";
import { setStateMetaParams } from "../../src/stateMetaStore";

import type { Params, State } from "@real-router/core";

export { createTestRouter } from "./testRouters";

export function omitMeta(
  obj?: State,
): Pick<State, "name" | "params" | "path"> | undefined {
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
): State => {
  const state: State = {
    name,
    path: `/${name.replaceAll(".", "/")}`,
    params,
    transition: DEFAULT_TRANSITION,
    context: {},
  };

  setStateMetaParams(state, metaParams);

  return state;
};
