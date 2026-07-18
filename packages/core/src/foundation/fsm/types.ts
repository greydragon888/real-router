export interface FSMConfig<
  TStates extends string,
  TEvents extends string,
  TContext,
> {
  initial: TStates;
  context: TContext;
  transitions: Record<TStates, Partial<Record<TEvents, TStates>>>;
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
