import type {
  FSMConfig,
  PayloadOf,
  TransitionInfo,
  TransitionListener,
} from "./types";

/**
 * The NORMALIZED edge: every entry is an object, so the hot-path property load
 * in `send()` sees ONE shape. The string form stays first-class in the config —
 * it is widened here, once per distinct table (cached), not per send.
 */
interface NormEdge<TStates extends string, TContext, TPayload> {
  readonly target: TStates;
  readonly when: ((ctx: TContext, payload: TPayload) => boolean) | undefined;
  readonly update: ((ctx: TContext, payload: TPayload) => void) | undefined;
}

type NormTable<TStates extends string> = Record<
  TStates,
  Record<string, NormEdge<TStates, never, never> | undefined>
>;

const NORMALIZED = new WeakMap<object, NormTable<string>>();

interface RawEdge {
  target: string;
  when?: unknown;
  update?: unknown;
}

/**
 * Widen ONE config entry into the normalized edge shape, validating it on the
 * way (#1159): `when` / `update`, when present, must be functions — a loud
 * throw with a coordinate, symmetric with #885.
 */
function normalizeEdge(
  state: string,
  event: string,
  declaration: string | RawEdge,
): NormEdge<string, never, never> {
  if (typeof declaration === "string") {
    return { target: declaration, when: undefined, update: undefined };
  }

  if (
    declaration.when !== undefined &&
    typeof declaration.when !== "function"
  ) {
    throw new Error(
      `[FSM.constructor] transitions["${state}"]["${event}"].when is not a function`,
    );
  }

  if (
    declaration.update !== undefined &&
    typeof declaration.update !== "function"
  ) {
    throw new Error(
      `[FSM.constructor] transitions["${state}"]["${event}"].update is not a function`,
    );
  }

  return {
    target: declaration.target,
    when: declaration.when as NormEdge<string, never, never>["when"],
    update: declaration.update as NormEdge<string, never, never>["update"],
  };
}

/**
 * Widen the config table into a single edge SHAPE and validate its closure.
 *
 * Two jobs, one cold pass: (1) the string form and the object form become the
 * SAME object, so the hot-path load in `send()` stays MONOMORPHIC — the
 * prototype gate measured the `string | object` union left in the hot path at
 * +12.3 % on `navigate/sync-baseline` against +3.0 % normalized; (2) every
 * target is checked for declaredness (#1159), so a dangling target cannot
 * silently enter an undeclared state and brick `canSend()`.
 *
 * Cached per distinct table OBJECT, so a shared module-level table (the router
 * FSM) is normalized once rather than once per instance — otherwise every SSR
 * clone would pay |states|×|events| allocations. The cache holds edges only;
 * the CONTEXT is per instance and never shared through it.
 */
function normalizeTable(table: object): NormTable<string> {
  const cached = NORMALIZED.get(table);

  if (cached !== undefined) {
    return cached;
  }

  const raw = table as Record<string, Record<string, string | RawEdge>>;
  const out = Object.create(null) as NormTable<string>;

  for (const [state, rawEdges] of Object.entries(raw)) {
    const edges = Object.create(null) as Record<
      string,
      NormEdge<string, never, never> | undefined
    >;

    for (const [event, declaration] of Object.entries(rawEdges)) {
      // An explicit `undefined` is the declared "no transition" no-op — skipped,
      // not a dangling target.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for JS / cast callers, whose table may carry explicit undefined
      if (declaration !== undefined) {
        edges[event] = normalizeEdge(state, event, declaration);
      }
    }

    out[state] = edges;
  }

  for (const edges of Object.values(out)) {
    for (const edge of Object.values(edges)) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- `Object.values` widens to include the record's `| undefined` member
      if (edge !== undefined && out[edge.target] === undefined) {
        throw new Error(
          `[FSM.constructor] state "${edge.target}" is not declared in config.transitions`,
        );
      }
    }
  }

  NORMALIZED.set(table, out);

  return out;
}

/**
 * Synchronous finite state machine engine.
 *
 * Reentrancy: `send()` inside `onTransition` listener is allowed but unbounded —
 * callers are responsible for preventing infinite loops.
 *
 * Exceptions: if a listener throws, the exception propagates to the caller.
 * State is already updated before listeners fire, so `getState()` reflects the
 * new state even if the exception escapes `send()`. A throwing `when` is a
 * CONTRACT break, and it is the one case where the state is NOT yet changed —
 * conditions run before the swap (RFC-10a §6.2).
 */
export class FSM<
  TStates extends string,
  TEvents extends string,
  TContext,
  TPayloadMap extends Partial<Record<TEvents, unknown>> = Record<never, never>,
> {
  #state: TStates;
  #currentTransitions: Record<
    string,
    NormEdge<TStates, TContext, never> | undefined
  >;
  #listenerCount = 0;
  #actions: Map<TStates, Map<TEvents, (payload: unknown) => void>> | null =
    null;
  readonly #context: TContext;
  readonly #transitions: Record<
    TStates,
    Record<string, NormEdge<TStates, TContext, never> | undefined>
  >;
  readonly #listeners: (TransitionListener<
    TStates,
    TEvents,
    TPayloadMap
  > | null)[] = [];

  constructor(config: FSMConfig<TStates, TEvents, TContext, TPayloadMap>) {
    this.#state = config.initial;
    this.#context = config.context;
    this.#transitions = normalizeTable(config.transitions) as Record<
      TStates,
      Record<string, NormEdge<TStates, TContext, never> | undefined>
    >;

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for JS / cast / string-typed callers
    if (this.#transitions[config.initial] === undefined) {
      throw new Error(
        `[FSM.constructor] state "${config.initial}" is not declared in config.transitions`,
      );
    }

    this.#currentTransitions = this.#transitions[config.initial];
  }

  /**
   * ⚠ The rest tuple lives in the OVERLOAD, the implementation takes a
   * positional parameter — and that split is load-bearing, not style.
   *
   * The tuple is what correlates the payload to the SPECIFIC event (#753):
   * a payload event requires its payload, a no-payload event rejects one, and
   * `send("A", payloadForB)` does not compile. Only a conditional rest tuple
   * can say that. But a rest parameter MATERIALISES AN ARRAY on every call,
   * and this is the router's hottest entry point — `send` and `canSend`
   * together run several times per navigation. Measured on the alloc probe
   * (window 200, median of 31): dropping the rest form off `canSend` alone is
   * **-88 B per navigation**, and doing it on `send` too collapses the p90
   * tail from 2384 to 2133 B, i.e. the array was intermittently escaping.
   *
   * `@real-router/event-emitter` already made this trade the other way round
   * for the same reason (`emit(name, a?, b?, c?, d?)` rather than `...args`);
   * the FSM engine simply never received it. Keeping the tuple in the overload
   * is what lets the engine have both.
   */
  send<E extends TEvents>(
    event: E,
    ...args: E extends keyof TPayloadMap ? [TPayloadMap[E]] : [undefined?]
  ): TStates;
  send(event: TEvents, sentPayload?: unknown): TStates {
    const declaration = this.#currentTransitions[event];

    if (declaration === undefined) {
      return this.#state;
    }

    const payload = sentPayload as PayloadOf<TEvents, TPayloadMap, TEvents>;
    const when = declaration.when;

    // A refused condition is indistinguishable from an undeclared event by
    // every observable: no swap, no update, no action, no listeners, and the
    // return value is the unchanged state (RFC-10a §6.2).
    if (when !== undefined && !when(this.#context, payload as never)) {
      return this.#state;
    }

    const nextState = declaration.target;
    const update = declaration.update;

    const from = this.#state;

    this.#state = nextState;
    this.#currentTransitions = this.#transitions[nextState];

    // Machine bookkeeping first, effects second: the action reads ONLY its
    // payload, so "does the action see pre- or post-update context" never
    // becomes a question on the hot path (RFC-10a §6.2).
    update?.(this.#context, payload as never);

    if (this.#actions !== null) {
      const action = this.#actions.get(from)?.get(event);

      if (action !== undefined) {
        action(payload);
      }
    }

    // Stryker disable next-line ConditionalExpression: equivalent — count>0 is a perf gate to skip the dispatch loop; `true` always enters it, but with no live listener `#listeners` holds only null slots and the loop body guards `listener !== null`, so dispatch is a no-op either way. The EqualityOperator `<=0` sibling on this line stays killed (not silenced here).
    if (this.#listenerCount > 0) {
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

  /**
   * `canSend(e, p)` is true ⟺ `send(e, p)` from the same state/context would
   * fire the transition — the mechanical-completeness invariant (RFC-10a §5).
   * The payload is optional: a payload-independent condition answers honestly
   * without one, while a payload-dependent one answers whatever it returns for
   * `undefined` — a refusal for some predicates, an accept for others
   * (INVARIANT 4). `send` stays the authority; pass the payload you intend to
   * send when the correlation has to hold.
   */
  canSend<E extends TEvents>(
    event: E,
    ...args: E extends keyof TPayloadMap ? [TPayloadMap[E]?] : [undefined?]
  ): boolean;
  canSend(event: TEvents, askedPayload?: unknown): boolean {
    const declaration = this.#currentTransitions[event];

    if (declaration === undefined) {
      return false;
    }

    return (
      declaration.when === undefined ||
      declaration.when(this.#context, askedPayload as never)
    );
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
    const edges = this.#transitions[from];

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for JS / cast / string-typed callers
    if (edges === undefined) {
      throw new Error(
        `[FSM.on] state "${from}" is not declared in config.transitions`,
      );
    }

    // #1682 — the state check above is ONE AXIS SHORT of what #885 claimed. An
    // action registered on a `(from, event)` pair with no edge can never fire,
    // which is the "silently dead-registering an action" this guard's own
    // docblock says it prevents. Measured before this landed: across 4651 tests
    // exactly one registration was affected, and it existed to pin the
    // permissiveness itself.
    //
    // One check is TOTAL over both dead shapes: `normalizeTable` drops an
    // explicit `undefined` target (the declared "no transition" no-op), so an
    // absent pair and a declared no-op are indistinguishable here — both simply
    // have no key.
    // `Object.hasOwn`, not `event in edges`: `in` walks the prototype chain, so
    // it would admit `toString` / `constructor` / `__proto__` as "declared
    // edges" the moment the normalised row stopped being a null-prototype
    // object. That is true today (`Object.create(null)` below) — which is
    // exactly why the `in` form passes its test — but it makes this guard depend
    // on a distant detail of `normalizeTable` instead of on itself.
    if (!Object.hasOwn(edges, event)) {
      throw new Error(
        `[FSM.on] event "${event}" has no edge from state "${from}"`,
      );
    }

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
