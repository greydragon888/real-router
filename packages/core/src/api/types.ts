import type { PluginApi as BasePluginApi } from "@real-router/types";
import type { RouteTree } from "route-tree";

export interface PluginApi extends Omit<BasePluginApi, "getTree"> {
  getTree: () => RouteTree;
}

export {
  type RoutesApi,
  type LifecycleApi,
  type DependenciesApi,
} from "@real-router/types";
