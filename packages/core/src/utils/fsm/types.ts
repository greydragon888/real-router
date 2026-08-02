/**
 * The payload a condition/update sees. `| undefined` because `canSend(event)`
 * is a legal ask without one — conditions are contractually TOTAL over it
 * (RFC-10a §6.4).
 */
export type PayloadOf<
  TEvents extends string,
  TPayloadMap extends Partial<Record<TEvents, unknown>>,
  E extends TEvents,
> = E extends keyof TPayloadMap ? TPayloadMap[E] | undefined : undefined;

/**
 * One edge of the table, in either of the two accepted forms.
 *
 * - `TStates` — the v1 string form: an unconditional transition. Stays first-class.
 * - the object form — a guarded transition: `when` decides whether the edge fires
 *   at all, `update` is the machine's own bookkeeping over the context.
 *
 * `when` must be pure and must not throw (RFC-10a §6.2). `update` mutates the
 * context in place (zero-alloc), runs AFTER the state swap and BEFORE the action.
 */
export type TransitionDeclaration<
  TStates extends string,
  TEvents extends string,
  TContext,
  TPayloadMap extends Partial<Record<TEvents, unknown>>,
  E extends TEvents,
> =
  | TStates
  | {
      readonly target: TStates;
      /**
       * ⚠ The `| undefined` is deliberate, not noise. The repo runs
       * `exactOptionalPropertyTypes`, under which a bare `when?: (…) => boolean`
       * REFUSES an explicit `{ when: undefined }` — so a decl built
       * programmatically (a helper, a generated table) could not spell "no
       * condition" at all. Same shape the repo uses for `RouterPayloads`'
       * optional members.
       */
      readonly when?:
        | ((
            ctx: TContext,
            payload: PayloadOf<TEvents, TPayloadMap, E>,
          ) => boolean)
        | undefined;
      readonly update?:
        | ((ctx: TContext, payload: PayloadOf<TEvents, TPayloadMap, E>) => void)
        | undefined;
    };

export type TransitionTable<
  TStates extends string,
  TEvents extends string,
  TContext,
  TPayloadMap extends Partial<Record<TEvents, unknown>>,
> = Record<
  TStates,
  {
    [E in TEvents]?: TransitionDeclaration<
      TStates,
      TEvents,
      TContext,
      TPayloadMap,
      E
    >;
  }
>;

export interface FSMConfig<
  TStates extends string,
  TEvents extends string,
  TContext,
  TPayloadMap extends Partial<Record<TEvents, unknown>> = Record<never, never>,
> {
  initial: TStates;
  context: TContext;
  transitions: TransitionTable<TStates, TEvents, TContext, TPayloadMap>;
}

export type TransitionInfo<
  TStates extends string,
  TEvents extends string,
  TPayloadMap extends Partial<Record<TEvents, unknown>>,
> = TEvents extends infer E extends TEvents
  ? {
      from: TStates;
      to: TStates;
      event: E;
      payload: E extends keyof TPayloadMap ? TPayloadMap[E] : undefined;
    }
  : never;

export type TransitionListener<
  TStates extends string,
  TEvents extends string,
  TPayloadMap extends Partial<Record<TEvents, unknown>>,
> = (info: TransitionInfo<TStates, TEvents, TPayloadMap>) => void;
