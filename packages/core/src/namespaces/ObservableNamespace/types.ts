// packages/core/src/namespaces/ObservableNamespace/types.ts

import type { events, plugins } from "../../constants";
import type { EventsKeys, State } from "@real-router/types";

export type EventMethodMap = {
  [K in EventsKeys as (typeof events)[K]]: (typeof plugins)[K];
};

/**
 * Observable state passed to subscribers
 */
export interface SubscribeState {
  route: State;
  previousRoute: State | undefined;
}

/**
 * Observer interface per Observable spec
 */
export interface Observer {
  next?: (value: SubscribeState) => void;
  error?: (err: unknown) => void;
  complete?: () => void;
}

/**
 * Subscription interface per Observable spec
 */
export interface Subscription {
  unsubscribe: () => void;
  readonly closed: boolean;
}

/**
 * Observable options for enhanced control
 */
export interface ObservableOptions {
  /** AbortSignal for automatic unsubscription */
  signal?: AbortSignal;
  /** Replay current state to new subscribers (default: true) */
  replay?: boolean;
}

/**
 * Observable interface for TC39 compliance
 */
export interface RouterObservable {
  [key: symbol]: () => RouterObservable;
  subscribe: (
    observer: Observer | ((value: SubscribeState) => void),
    options?: ObservableOptions,
  ) => Subscription;
}
