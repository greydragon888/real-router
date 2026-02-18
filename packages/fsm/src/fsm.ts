import type { FSMConfig, TransitionInfo, TransitionListener } from "./types";

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
  TPayloadMap extends Partial<Record<TEvents, unknown>> = Record<never, never>,
> {
  #state: TStates;
  #currentTransitions: Partial<Record<TEvents, TStates>>;
  #listenerCount = 0;
  readonly #context: TContext;
  readonly #transitions: Record<TStates, Partial<Record<TEvents, TStates>>>;
  readonly #listeners: (TransitionListener<
    TStates,
    TEvents,
    TPayloadMap
  > | null)[] = [];

  constructor(config: FSMConfig<TStates, TEvents, TContext>) {
    this.#state = config.initial;
    this.#context = config.context;
    this.#transitions = config.transitions;
    this.#currentTransitions = config.transitions[config.initial];
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

      for (const listener of this.#listeners) {
        if (listener !== null) {
          listener(info);
        }
      }
    }

    return this.#state;
  }

  canSend(event: TEvents): boolean {
    return this.#currentTransitions[event] !== undefined;
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

    if (nullIndex === -1) {
      index = this.#listeners.length;
      this.#listeners.push(listener);
    } else {
      this.#listeners[nullIndex] = listener;
      index = nullIndex;
    }

    this.#listenerCount++;
    let subscribed = true;

    return () => {
      if (!subscribed) {
        return;
      }

      subscribed = false;
      this.#listeners[index] = null;
      this.#listenerCount--;
    };
  }
}
