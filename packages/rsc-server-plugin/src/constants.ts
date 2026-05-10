import type { RscSsrMode } from "./types";

const LOGGER_CONTEXT = "rsc-server-plugin";

export const ERROR_PREFIX = `[@real-router/${LOGGER_CONTEXT}]`;

/**
 * The strict subset of `SsrMode` that `rsc-server-plugin` accepts.
 * `"data-only"` is intentionally excluded — RSC has no semantically meaningful
 * "data without component" (the Flight payload IS the data + component).
 *
 * Single source of truth for `factory.ts` (`createSsrLoaderPlugin` allowedModes),
 * `validation.ts` (factory-time loader-map validator), and `getSsrRscMode.ts`
 * (runtime read-side guard against TS-cast-bypassed garbage in `state.context`).
 */
export const ALLOWED_RSC_MODES: readonly RscSsrMode[] = ["full", "client-only"];
