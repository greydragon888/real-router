import type { FSMConfig, TransitionInfo, TransitionListener } from "./types";

/**
 * Shared guard for the engine-wide invariant "the state is declared in
 * `config.transitions`". Applied at every state-entry-point (constructor
 * `initial`, `forceState`, `on`'s `from`) so an undeclared state fails loud with
 * an explicit error instead of bricking the FSM or dead-registering an action
 * (#885). Returns the state's transition map for the caller to reuse.
 */
function requireDeclared<TStates extends string, TEvents extends string>(
  transitions: Record<TStates, Partial<Record<TEvents, TStates>>>,
  state: TStates,
  where: string,
): Partial<Record<TEvents, TStates>> {
  const stateTransitions = transitions[state];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for JS / cast / string-typed callers passing a state outside TStates
  if (stateTransitions === undefined) {
    throw new Error(
      `[FSM.${where}] state "${state}" is not declared in config.transitions`,
    );
  }

  return stateTransitions;
}

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
  #actions: Map<TStates, Map<TEvents, (payload: unknown) => void>> | null =
    null;
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
    this.#currentTransitions = requireDeclared(
      config.transitions,
      config.initial,
      "constructor",
    );
  }

  send<E extends TEvents>(
    event: E,
    ...args: E extends keyof TPayloadMap ? [TPayloadMap[E]] : [undefined?]
  ): TStates {
    const nextState = this.#currentTransitions[event];

    if (nextState === undefined) {
      return this.#state;
    }

    const from = this.#state;

    this.#state = nextState;
    this.#currentTransitions = this.#transitions[nextState];

    const payload = args[0] as TPayloadMap[TEvents] | undefined;

    if (this.#actions !== null) {
      const action = this.#actions.get(from)?.get(event);

      if (action !== undefined) {
        action(payload);
      }
    }

    if (this.#listenerCount > 0) {
      const info: TransitionInfo<TStates, TEvents, TPayloadMap> = {
        from,
        to: nextState,
        event,
        payload: payload,
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

  /**
   * Directly sets FSM state without triggering actions or listeners.
   * Use for hot-path optimizations where the caller handles side effects.
   *
   * Throws if `state` is not declared in `config.transitions`: an undeclared
   * state would leave `#currentTransitions` undefined and brick the next
   * `canSend`/`send`. The state is left unchanged when the guard rejects.
   */
  forceState(state: TStates): void {
    const transitions = requireDeclared(this.#transitions, state, "forceState");

    this.#state = state;
    this.#currentTransitions = transitions;
  }

  getState(): TStates {
    return this.#state;
  }

  getContext(): TContext {
    return this.#context;
  }

  on<E extends TEvents>(
    from: TStates,
    event: E,
    action: E extends keyof TPayloadMap
      ? (payload: TPayloadMap[E]) => void
      : () => void,
  ): () => void {
    requireDeclared(this.#transitions, from, "on");

    this.#actions ??= new Map();

    let stateActions = this.#actions.get(from);

    if (!stateActions) {
      stateActions = new Map();
      this.#actions.set(from, stateActions);
    }

    const capturedAction = action as (payload: unknown) => void;

    stateActions.set(event, capturedAction);

    return () => {
      const stateMap = this.#actions?.get(from);

      if (stateMap?.get(event) === capturedAction) {
        stateMap.delete(event);
      }
    };
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
