// packages/core/src/namespaces/PluginsNamespace/constants.ts

import {
  events as EVENTS_CONST,
  plugins as PLUGINS_CONST,
} from "../../constants";

import type { EventName } from "../../types";

/**
 * Intrinsics captured at module load (#1971).
 *
 * ⚑ These DECIDE — each answers "what is on this object" for a value this module
 * did not build, so read off the live global they are the weakest point of every
 * check built on them. `guards.ts` states the doctrine and its measurement: one
 * naive `Object.hasOwn` polyfill walked straight through five sibling readers
 * while the single captured guard held.
 *
 * ⚠ Capture narrows the window from "any time after boot" to "before this module
 * loads". It does not close it — a shim evaluated ahead of core still wins
 * (#1798), which is the doctrine's own caveat and travels with it.
 */
const objectKeys = Object.keys;

/**
 * Maps plugin method names to router event names.
 */
export const EVENTS_MAP = {
  [PLUGINS_CONST.ROUTER_START]: EVENTS_CONST.ROUTER_START,
  [PLUGINS_CONST.ROUTER_STOP]: EVENTS_CONST.ROUTER_STOP,
  [PLUGINS_CONST.TRANSITION_SUCCESS]: EVENTS_CONST.TRANSITION_SUCCESS,
  [PLUGINS_CONST.TRANSITION_START]: EVENTS_CONST.TRANSITION_START,
  [PLUGINS_CONST.TRANSITION_LEAVE_APPROVE]:
    EVENTS_CONST.TRANSITION_LEAVE_APPROVE,
  [PLUGINS_CONST.TRANSITION_ERROR]: EVENTS_CONST.TRANSITION_ERROR,
  [PLUGINS_CONST.TRANSITION_CANCEL]: EVENTS_CONST.TRANSITION_CANCEL,
} as const satisfies Record<
  (typeof PLUGINS_CONST)[keyof typeof PLUGINS_CONST],
  EventName
>;

/**
 * Plugin method names that correspond to router events.
 */
export const EVENT_METHOD_NAMES = objectKeys(
  EVENTS_MAP,
) as (keyof typeof EVENTS_MAP)[];

export const LOGGER_CONTEXT = "router.usePlugin";
