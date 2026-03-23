import type { RouteContext as RouteContextType } from "./types";
import type { Router, Navigator } from "@real-router/core";
import type { InjectionKey } from "vue";

export const RouterKey: InjectionKey<Router> = Symbol("RouterKey");

export const NavigatorKey: InjectionKey<Navigator> = Symbol("NavigatorKey");

export const RouteKey: InjectionKey<RouteContextType> = Symbol("RouteKey");
