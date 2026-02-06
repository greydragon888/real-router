// Types for @real-router/rx

// Import for type reference
import type { RxObservable } from "./RxObservable";

export interface Observer<T> {
  next?: (value: T) => void;
  error?: (err: unknown) => void;
  complete?: () => void;
}

export interface Subscription {
  unsubscribe: () => void;
  readonly closed: boolean;
}

export interface ObservableOptions {
  signal?: AbortSignal;
  replay?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- void required: subscribe fn may have no return statement
export type SubscribeFn<T> = (observer: Observer<T>) => void | (() => void);

export type Operator<T, R> = (source: RxObservable<T>) => RxObservable<R>;

export type UnaryFunction<T, R> = (source: T) => R;
