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

      const updatedTransitions: Record<
        string,
        Partial<Record<string, string>>
      > = {
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
