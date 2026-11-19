/**
 * RouterValidator — the three `state` diagnostics core reports through the
 * validator slot. Every refusal and every other report is a check position or
 * a diagnostic kind (#2388).
 *
 * This interface is implemented by the validation plugin and injected into
 * RouterInternals. When ctx.validator is null (default), nothing is reported.
 *
 * Where core already holds the fact the analyser judges, the fact travels — a
 * name, a key, a state — rather than the container it was read from (#2382).
 */

import type { ParamsSearch, State, UrlChannels } from "./base";

export interface RouterValidator {
  /**
   * State diagnostics
   */
  state: {
    /**
     * The mode gate's opt-in diagnostic (#1575). Core DROPS a query key the
     * active `queryParamsMode` will not print — silently, by the same
     * always-on-fixes / opt-in-diagnoses split the channel guard follows. This
     * hook is what makes the drop visible in development.
     *
     * Called once per dropped key, from the gate itself, so the report cannot
     * disagree with what was actually dropped. A `defaultSearch` declared for
     * such a key surfaces through the same call — it is dead config in these
     * modes, and that is the edge worth naming out loud.
     */
    reportDroppedQueryKey: (routeName: string, key: string) => void;

    /** Opt-in diagnostic for a key the route declares NOWHERE (#1579). */
    reportUndeclaredParamKey: (routeName: string, key: string) => void;

    /**
     * Opt-in diagnostic for a route codec that does not round-trip the state a
     * navigation commits (#2905). `navigate` takes params in the form
     * `decodeParams` returns and never runs it, so the state a link commits and
     * the state its own URL matches back to agree only when `decodeParams`
     * undoes `encodeParams` and adds no key.
     *
     * Called by the two committing producers, `navigate` and
     * `buildNavigationState`, with the state each builds, and only for a
     * route that has a codec. `pathSlots` are the path slot names the route's
     * URL prints, the root's included: a params key outside them never reaches
     * the URL (#1553).
     */
    reportCodecRoundTrip: (
      state: State,
      codec: {
        readonly encode: ((channels: ParamsSearch) => ParamsSearch) | undefined;
        readonly decode: ((channels: UrlChannels) => ParamsSearch) | undefined;
      },
      pathSlots: readonly string[],
    ) => void;
  };
}
