export interface FSMConfig<
  TStates extends string,
  TEvents extends string,
  TContext,
> {
  initial: TStates;
  context: TContext;
  transitions: Record<TStates, Partial<Record<TEvents, TStates>>>;
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

export type TransitionListener<
  TStates extends string,
  TEvents extends string,
  TPayloadMap extends Partial<Record<TEvents, unknown>>,
> = (info: TransitionInfo<TStates, TEvents, TPayloadMap>) => void;
