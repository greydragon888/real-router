// packages/core/src/channels/index.ts

/**
 * Channel correctness — one rule, three mechanisms.
 *
 * `params` is the path channel, `search` the query channel, and the router moves
 * nothing between them: the two meet in exactly one place, the printed URL. The
 * slot IS the channel, in every position.
 *
 * Only `guard` is a guard (core's fifth always-on invariant guard); `defaults`
 * applies the same rule at registration, `modeGate` normalises at the pipeline's
 * terminal. This directory imports nothing from the namespaces, the engine or
 * the pipeline — declared query names arrive as DATA, never as a matcher
 * (eslint-enforced, `packages/core/eslint.config.mjs`).
 *
 * Why a subsystem, the twelve call sites, and the render-path rules that differ
 * per mechanism: ./CLAUDE.md
 *
 * @module channels
 */

export {
  assertChannelCorrect,
  findMisChanneledKey,
  misChanneledKeyMessage,
} from "./guard";

export { assertRouteDefaultChannels, withholdFilledSlots } from "./defaults";

export { admittedSearch } from "./modeGate";
