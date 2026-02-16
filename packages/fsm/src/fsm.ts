export interface FSMConfig<
  TStates extends string,
  TEvents extends string,
  TContext,
  TPayloadMap extends Partial<Record<TEvents, unknown>> = Record<
    TEvents,
    never
  >,
> {
  initial: TStates;
  context: TContext;
  transitions: Record<TStates, Partial<Record<TEvents, TStates>>>;
  /** @internal */
  readonly __payloadMap?: TPayloadMap;
}

export interface TransitionInfo<
  TStates extends string,
  TEvents extends string,
  TPayloadMap extends Partial<Record<TEvents, unknown>>,
> {
  from: TStates;
  to: TStates;
  event: TEvents;
  payload: TPayloadMap[TEvents] | undefined;
}

type TransitionListener<
  TStates extends string,
  TEvents extends string,
  TPayloadMap extends Partial<Record<TEvents, unknown>>,
> = (info: TransitionInfo<TStates, TEvents, TPayloadMap>) => void;

/**
 * Synchronous finite state machine engine.
 *
 * Reentrancy: `send()` inside `onTransition` listener is allowed but unbounded —
 * callers are responsible for preventing infinite loops.
 *
 * Exceptions: if a listener throws, the exception propagates to the caller.
 * State is already updated before listeners fire, so `getState()` reflects the
 * new state even if the exception escapes `send()`.
 */
export class FSM<
  TStates extends string,
  TEvents extends string,
  TContext,
  TPayloadMap extends Partial<Record<TEvents, unknown>> = Record<
    TEvents,
    never
  >,
> {
  #state: TStates;
  #context: TContext;
  #transitions: Record<TStates, Partial<Record<TEvents, TStates>>>;
  #currentTransitions: Partial<Record<TEvents, TStates>>;
  #listeners: Array<TransitionListener<TStates, TEvents, TPayloadMap> | null>;
  #listenerCount: number;

  constructor(config: FSMConfig<TStates, TEvents, TContext, TPayloadMap>) {
    this.#state = config.initial;
    this.#context = config.context;
    this.#transitions = config.transitions;
    this.#currentTransitions = config.transitions[config.initial];
    this.#listeners = [];
    this.#listenerCount = 0;
  }

  send<E extends TEvents>(
    event: E,
    ...args: E extends keyof TPayloadMap
      ? [payload: TPayloadMap[E]]
      : [payload?: never]
  ): TStates {
    const nextState = this.#currentTransitions[event];

    if (nextState === undefined) {
      return this.#state;
    }

    const from = this.#state;
    this.#state = nextState;
    this.#currentTransitions = this.#transitions[nextState];

    if (this.#listenerCount > 0) {
      const info: TransitionInfo<TStates, TEvents, TPayloadMap> = {
        from,
        to: nextState,
        event,
        payload: args[0] as TPayloadMap[TEvents] | undefined,
      };
      const listeners = this.#listeners;
      for (let i = 0; i < listeners.length; i++) {
        const listener = listeners[i];
        if (listener !== null) {
          listener(info);
        }
      }
    }

    return this.#state;
  }

  getState(): TStates {
    return this.#state;
  }

  getContext(): TContext {
    return this.#context;
  }

  onTransition(
    listener: (info: TransitionInfo<TStates, TEvents, TPayloadMap>) => void,
  ): () => void {
    const nullIndex = this.#listeners.indexOf(null);
    let index: number;

    if (nullIndex !== -1) {
      this.#listeners[nullIndex] = listener;
      index = nullIndex;
    } else {
      index = this.#listeners.length;
      this.#listeners.push(listener);
    }

    this.#listenerCount++;
    let subscribed = true;

    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#listeners[index] = null;
      this.#listenerCount--;
    };
  }
}
