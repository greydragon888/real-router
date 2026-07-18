import type { PluginApi as BasePluginApi } from "../types";
import type { RouteTree } from "engine";

export interface PluginApi extends Omit<BasePluginApi, "getTree"> {
  getTree: () => RouteTree;
}

export {
  type RoutesApi,
  type LifecycleApi,
  type DependenciesApi,
} from "../types";
