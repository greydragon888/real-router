import type { Router } from "../Router";
import type { PluginApi } from "./types";
import type { DefaultDependencies } from "@real-router/types";

export function getPluginApi<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(router: Router<Dependencies>): PluginApi {
  return {
    makeState: router.makeState,
    buildState: router.buildState,
    forwardState: router.forwardState,
    matchPath: router.matchPath,
    setRootPath: router.setRootPath,
    getRootPath: router.getRootPath,
    navigateToState: router.navigateToState,
    addEventListener: router.addEventListener,
    getOptions: router.getOptions,
    getTree: router.getTree,
  };
}
