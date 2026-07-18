import type { RscActionResult, RscPayload } from "./types";
import type { State } from "@real-router/core";
import type { ReactNode } from "react";

/**
 * Build a canonical Flight payload from `state.context.rsc` (+ optional
 * Server Component override) and `state.context.rscAction`.
 *
 * Removes the repeated `{ root, returnValue, formState }` boilerplate at
 * the call site:
 *
 * ```ts
 * import { renderToReadableStream } from "@vitejs/plugin-rsc/rsc";
 * const flight = renderToReadableStream(buildRscPayload(state));
 * ```
 *
 * Pass `rootOverride` to wrap the per-route Server Component tree (e.g.
 * with cross-cutting layout chrome) without rebuilding the payload by
 * hand:
 *
 * ```ts
 * const wrapped = (
 *   <>
 *     <NotificationBanner action={state.context.rscAction} />
 *     {state.context.rsc}
 *   </>
 * );
 * const payload = buildRscPayload<MyData, ReactFormState>(state, wrapped);
 * ```
 *
 * `rootOverride === undefined` means "use the default" (`state.context.rsc`).
 * Pass `null` to explicitly render nothing — `null` is a valid `ReactNode`
 * and is preserved as-is, **not** treated as "fall back to default".
 *
 * `returnValue` and `formState` are **omitted** (not set to `undefined`)
 * when their source is missing, so the result type-checks under
 * `exactOptionalPropertyTypes: true` consumers without ceremony.
 */
export function buildRscPayload<TReturn = unknown, TFormState = unknown>(
  state: State,
  rootOverride?: ReactNode,
): RscPayload<TReturn, TFormState> {
  const ctx = state.context as {
    rsc?: ReactNode;
    rscAction?: RscActionResult<TReturn, TFormState>;
  };

  // `??` would collapse an explicit `null` override to the default — use a
  // strict `=== undefined` check so callers can render nothing on purpose.
  const root = rootOverride === undefined ? ctx.rsc : rootOverride;

  const payload: RscPayload<TReturn, TFormState> = { root };
  const action = ctx.rscAction;

  if (action?.returnValue !== undefined) {
    payload.returnValue = action.returnValue;
  }

  if (action?.formState !== undefined) {
    payload.formState = action.formState;
  }

  return payload;
}
