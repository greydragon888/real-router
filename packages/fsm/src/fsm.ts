import type { FSMConfig, TransitionInfo, TransitionListener } from "./types";

/**
 * Shared guard for the engine-wide invariant "the state is declared in
 * `config.transitions`". Applied at every state-entry-point (constructor
 * `initial` and `on`'s `from`) so an undeclared state fails loud with
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

    // #1159: validate table closure — every declared transition target must
    // itself be a declared state. `send()` applies table values
    // (`this.#transitions[nextState]`) without re-checking, so a dangling
    // target would silently enter an undeclared state (violating Validity #1)
    // and brick `canSend()` (violating No-bricking #10). One cold-path
    // O(states×events) pass at construction fails loud instead — the fourth
    // state-entry-point, mirroring the `initial` / `on` guards. Explicit
    // `undefined` values are the declared "no transition" no-op (send() returns
    // the current state) and are skipped. Post-construction mutation of the
    // shared table stays a documented GIGO boundary (Edge #5).
    for (const state of Object.keys(config.transitions)) {
      const stateTransitions = config.transitions[state as TStates];

      for (const event of Object.keys(stateTransitions)) {
        const target = stateTransitions[event as TEvents];

        if (target !== undefined) {
          requireDeclared(config.transitions, target, "constructor");
        }
      }
    }
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

    // Stryker disable next-line ConditionalExpression: equivalent — count>0 is a perf gate to skip the dispatch loop; `true` always enters it, but with no live listener `#listeners` holds only null slots and the loop body guards `listener !== null`, so dispatch is a no-op either way. The EqualityOperator `<=0` sibling on this line stays killed (not silenced here).
    if (this.#listenerCount > 0) {
      // `info` is structurally a valid TransitionInfo, but the distributive
      // union can't be matched to one variant while `event`/`payload` are
      // generic here — erase through `unknown` (TS2352), same spirit as the
      // `args[0]` cast above.
      const info = {
        from,
        to: nextState,
        event,
        payload,
      } as unknown as TransitionInfo<TStates, TEvents, TPayloadMap>;

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
      // Stryker disable next-line OptionalChaining: equivalent — `#actions` is assigned (`??= new Map()` above) before this unsubscribe closure is created and returned, so it is never null when the closure runs; `?.` can't short-circuit and behaves identically to `.get`.
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
      // Stryker disable next-line UpdateOperator: equivalent — #listenerCount feeds only the `> 0` loop gate; `++` inflates it but the loop then iterates already-nulled slots (no-op), and no public reader exposes the count, so the miscount is unobservable.
      this.#listenerCount--;
    };
  }
}
