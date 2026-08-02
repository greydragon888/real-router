import { fc } from "@fast-check/vitest";

import { FSM } from "../../../../src/utils/fsm/index.js";

import type { FSMConfig } from "../../../../src/utils/fsm/index.js";

export const NUM_RUNS = { standard: 100, lifecycle: 50, async: 30 } as const;

export interface GeneratedFSMConfig {
  readonly config: FSMConfig<string, string, null>;
  readonly states: readonly string[];
  readonly events: readonly string[];
}

export interface GeneratedFSMConfigWithSelfLoop extends GeneratedFSMConfig {
  readonly selfLoopEvent: string;
}

/**
 * Generates a valid FSM config with 2–5 states and 2–4 events.
 * Transition table is encoded as a flat array of integers:
 * -1 = no transition for (state[si], event[ei]); otherwise = target state index.
 * Index formula: si * numEvents + ei.
 */
export const arbFSMConfig: fc.Arbitrary<GeneratedFSMConfig> = fc
  .tuple(fc.integer({ min: 2, max: 5 }), fc.integer({ min: 2, max: 4 }))
  .chain(([numStates, numEvents]) => {
    const states = Array.from({ length: numStates }, (_, i) => `s${i}`);
    const events = Array.from({ length: numEvents }, (_, i) => `E${i}`);
    const statesCast = states as [string, ...string[]];

    const tableArb = fc.array(fc.integer({ min: -1, max: numStates - 1 }), {
      minLength: numStates * numEvents,
      maxLength: numStates * numEvents,
    });

    return fc
      .tuple(fc.constantFrom(...statesCast), tableArb)
      .map(([initial, flatTable]): GeneratedFSMConfig => {
        const transitions: Record<string, Partial<Record<string, string>>> = {};

        for (let si = 0; si < numStates; si++) {
          const fromState = states[si];
          const trans: Partial<Record<string, string>> = {};

          for (let ei = 0; ei < numEvents; ei++) {
            const targetIndex = flatTable[si * numEvents + ei];

            if (targetIndex !== -1) {
              trans[events[ei]] = states[targetIndex];
            }
          }

          transitions[fromState] = trans;
        }

        return {
          config: {
            initial,
            context: null,
            transitions,
          },
          states,
          events,
        };
      });
  });

export const arbFSMConfigWithSelfLoop: fc.Arbitrary<GeneratedFSMConfigWithSelfLoop> =
  arbFSMConfig.chain((gen) => {
    const eventsCast = gen.events as [string, ...string[]];

    return fc.constantFrom(...eventsCast).map((selfLoopEvent) => {
      const { initial } = gen.config;
      const currentTrans = gen.config.transitions[initial] as Record<
        string,
        string
      >;

      const updatedTransitions: typeof gen.config.transitions = {
        ...gen.config.transitions,
        [initial]: {
          ...currentTrans,
          [selfLoopEvent]: initial,
        },
      };

      return {
        ...gen,
        config: {
          initial,
          context: null,
          transitions: updatedTransitions,
        },
        selfLoopEvent,
      };
    });
  });

export const arbEventSequence = (
  events: readonly string[],
): fc.Arbitrary<string[]> =>
  fc.array(fc.constantFrom(...(events as [string, ...string[]])), {
    minLength: 1,
    maxLength: 20,
  });

export const arbMixedEventSequence = (
  events: readonly string[],
): fc.Arbitrary<string[]> =>
  fc.array(
    fc.oneof(
      fc.constantFrom(...(events as [string, ...string[]])),
      fc
        .string({ minLength: 1, maxLength: 5 })
        .filter((s) => !events.includes(s)),
    ),
    { minLength: 1, maxLength: 20 },
  );

export function createFSM(gen: GeneratedFSMConfig): FSM<string, string, null> {
  return new FSM(gen.config);
}

/**
 * Like {@link createFSM} but typed with an open payload map (every event carries
 * an `unknown` payload), so `send(event, payload)` and payload-receiving actions
 * type-check. Used to exercise runtime payload delivery generatively.
 */
export function createFSMWithPayloads(
  gen: GeneratedFSMConfig,
): FSM<string, string, null, Record<string, unknown>> {
  return new FSM<string, string, null, Record<string, unknown>>(gen.config);
}

// --- Action test support ---

export interface GeneratedFSMConfigWithInitialTransition extends GeneratedFSMConfig {
  readonly knownEvent: string;
  readonly knownTo: string;
}

export const arbFSMConfigWithInitialTransition: fc.Arbitrary<GeneratedFSMConfigWithInitialTransition> =
  arbFSMConfig
    .filter((gen) => {
      const trans = gen.config.transitions[gen.config.initial];

      return Object.values(trans).some((to) => to !== undefined);
    })
    .chain((gen) => {
      const trans = gen.config.transitions[gen.config.initial];
      const entries = Object.entries(trans).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      );
      const [first, ...rest] = entries;

      return fc.constantFrom(first, ...rest).map(([event, to]) => ({
        ...gen,
        knownEvent: event,
        knownTo: to,
      }));
    });

// --- Two-step chain support (reentrancy) ---

export interface GeneratedFSMConfigWithTwoStepChain extends GeneratedFSMConfigWithInitialTransition {
  /** An event with a transition out of `knownTo`. */
  readonly secondEvent: string;
  /** The target of `knownTo` --(secondEvent)--> `secondTo` (guaranteed != knownTo). */
  readonly secondTo: string;
}

/**
 * A config with a two-step chain `initial --(knownEvent)--> knownTo
 * --(secondEvent)--> secondTo`, where `secondTo !== knownTo` so the final state
 * differs from the intermediate one (required to observe reentrant `info.to`
 * staleness, where the outer listener's `info.to` is `knownTo` while
 * `getState()` is already `secondTo`).
 */
export const arbFSMConfigWithTwoStepChain: fc.Arbitrary<GeneratedFSMConfigWithTwoStepChain> =
  arbFSMConfigWithInitialTransition
    .filter((gen) => {
      const trans = gen.config.transitions[gen.knownTo];

      return Object.values(trans).some(
        (to) => to !== undefined && to !== gen.knownTo,
      );
    })
    .chain((gen) => {
      const trans = gen.config.transitions[gen.knownTo];
      const entries = Object.entries(trans).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && entry[1] !== gen.knownTo,
      );
      const [first, ...rest] = entries;

      return fc.constantFrom(first, ...rest).map(([secondEvent, secondTo]) => ({
        ...gen,
        secondEvent,
        secondTo,
      }));
    });

// ---------------------------------------------------------------------------
// Guarded edges (`when`) and context updates (`update`) — RFC-10a §13.1, #1646.
//
// A SIBLING of `arbFSMConfig`, not an extension of it. Widening the shared
// arbitrary would change what ~15 existing properties mean: a refused `when` is
// observationally identical to an undeclared event, so "Rejection" and "canSend
// correlation" would silently start generating the guarded case under
// formulations written for the unguarded one. The guarded axis gets its own
// generator and its own block.
// ---------------------------------------------------------------------------

/** What the generated `update`s write, so a property can count what fired. */
export interface CounterContext {
  fired: number;
  lastEvent: string | undefined;
}

/** Every generated event carries this; `allow` is what a generated `when` reads. */
export type GuardedPayloads = Record<string, { allow: boolean }>;

/** One edge, in the shape the generator picked for it. */
export type EdgeKind = "string" | "object" | "update" | "guarded";

export interface GeneratedGuardedFSMConfig {
  readonly config: FSMConfig<string, string, CounterContext, GuardedPayloads>;
  /** The SAME table with every edge written in the bare-string form. */
  readonly stringTwin: FSMConfig<
    string,
    string,
    CounterContext,
    GuardedPayloads
  >;
  readonly states: readonly string[];
  readonly events: readonly string[];
  /** `"from|event"` for every edge whose `when` can refuse. */
  readonly guardedEdges: ReadonlySet<string>;
  /** `"from|event"` for every edge carrying an `update`. */
  readonly updatingEdges: ReadonlySet<string>;
}

export const newCounterContext = (): CounterContext => ({
  fired: 0,
  lastEvent: undefined,
});

/**
 * Tables mixing all four edge forms over a counter context.
 *
 * `stringTwin` is the same topology with every edge reduced to its bare target,
 * which is what lets a property assert that pre-normalisation is NEUTRAL: the
 * two configs must be indistinguishable whenever no `when` refuses.
 */
export const arbGuardedFSMConfig: fc.Arbitrary<GeneratedGuardedFSMConfig> = fc
  .tuple(fc.integer({ min: 2, max: 4 }), fc.integer({ min: 2, max: 3 }))
  .chain(([numStates, numEvents]) => {
    const states = Array.from({ length: numStates }, (_, i) => `s${i}`);
    const events = Array.from({ length: numEvents }, (_, i) => `E${i}`);
    const statesCast = states as [string, ...string[]];
    const size = numStates * numEvents;

    return fc
      .tuple(
        fc.constantFrom(...statesCast),
        fc.array(fc.integer({ min: -1, max: numStates - 1 }), {
          minLength: size,
          maxLength: size,
        }),
        fc.array(
          fc.constantFrom<EdgeKind>("string", "object", "update", "guarded"),
          { minLength: size, maxLength: size },
        ),
      )
      .map(([initial, targets, kinds]): GeneratedGuardedFSMConfig => {
        const transitions = {} as Record<string, Record<string, unknown>>;
        const twin = {} as Record<string, Record<string, unknown>>;
        const guardedEdges = new Set<string>();
        const updatingEdges = new Set<string>();

        const update = (ctx: CounterContext): void => {
          ctx.fired++;
        };

        for (let si = 0; si < numStates; si++) {
          const from = states[si];
          const edges: Record<string, unknown> = {};
          const twinEdges: Record<string, unknown> = {};

          for (let ei = 0; ei < numEvents; ei++) {
            const targetIndex = targets[si * numEvents + ei];

            if (targetIndex === -1) {
              continue;
            }

            const event = events[ei];
            const target = states[targetIndex];
            const kind = kinds[si * numEvents + ei];

            twinEdges[event] = target;

            switch (kind) {
              case "string": {
                edges[event] = target;

                break;
              }
              case "object": {
                edges[event] = { target };

                break;
              }
              case "update": {
                edges[event] = { target, update };
                updatingEdges.add(`${from}|${event}`);

                break;
              }
              default: {
                edges[event] = {
                  target,
                  when: (_ctx: CounterContext, payload?: { allow: boolean }) =>
                    payload?.allow === true,
                  update,
                };
                guardedEdges.add(`${from}|${event}`);
                updatingEdges.add(`${from}|${event}`);
              }
            }
          }

          transitions[from] = edges;
          twin[from] = twinEdges;
        }

        const shape = (
          table: Record<string, Record<string, unknown>>,
        ): FSMConfig<string, string, CounterContext, GuardedPayloads> =>
          ({
            initial,
            context: newCounterContext(),
            transitions: table,
          }) as unknown as FSMConfig<
            string,
            string,
            CounterContext,
            GuardedPayloads
          >;

        return {
          config: shape(transitions),
          stringTwin: shape(twin),
          states,
          events,
          guardedEdges,
          updatingEdges,
        };
      });
  });
