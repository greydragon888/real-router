export interface EventEmitterLimits {
  maxListeners: number;
  warnListeners: number;
}

export interface EventEmitterOptions {
  limits?: EventEmitterLimits;
  onListenerError?: (eventName: string, error: unknown) => void;
  onListenerWarn?: (eventName: string, count: number) => void;
}

export type Unsubscribe = () => void;
