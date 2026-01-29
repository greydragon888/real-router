// packages/core/src/namespaces/PluginsNamespace/constants.ts

import { isObjKey } from "type-guards";

import {
  events as EVENTS_CONST,
  plugins as PLUGINS_CONST,
} from "../../constants";

import type { EventName } from "@real-router/types";

/**
 * Plugin registry limits to prevent memory leaks.
 */
export const PLUGIN_LIMITS = {
  WARN: 10,
  ERROR: 25,
  HARD_LIMIT: 50,
} as const;

/**
 * Maps plugin method names to router event names.
 */
export const EVENTS_MAP = {
  [PLUGINS_CONST.ROUTER_START]: EVENTS_CONST.ROUTER_START,
  [PLUGINS_CONST.ROUTER_STOP]: EVENTS_CONST.ROUTER_STOP,
  [PLUGINS_CONST.TRANSITION_SUCCESS]: EVENTS_CONST.TRANSITION_SUCCESS,
  [PLUGINS_CONST.TRANSITION_START]: EVENTS_CONST.TRANSITION_START,
  [PLUGINS_CONST.TRANSITION_ERROR]: EVENTS_CONST.TRANSITION_ERROR,
  [PLUGINS_CONST.TRANSITION_CANCEL]: EVENTS_CONST.TRANSITION_CANCEL,
} as const satisfies Record<
  (typeof PLUGINS_CONST)[keyof typeof PLUGINS_CONST],
  EventName
>;

/**
 * Plugin method names that correspond to router events.
 */
export const EVENT_METHOD_NAMES = Object.keys(EVENTS_MAP).filter(
  (eventName): eventName is keyof typeof EVENTS_MAP =>
    isObjKey<typeof EVENTS_MAP>(eventName, EVENTS_MAP),
);

export const LOGGER_CONTEXT = "router.usePlugin";
