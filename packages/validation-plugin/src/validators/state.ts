// packages/validation-plugin/src/validators/state.ts

import { raiser } from "@real-router/core/utils";
import { areParamValuesEqual } from "@real-router/core/validation";

import { isString, isParams, getTypeDescription } from "../type-guards";

import type {
  ParamsSearch,
  RouterLogger,
  RouterValidator,
} from "@real-router/core";

const atMakeState = raiser("router", "makeState");

/**
 * Captured at module load (#1971): it decides which keys a bag returned by the
 * application's codec carries.
 */
const entriesOf = Object.entries;

export function validateMakeStateArgs(
  name: unknown,
  params: unknown,
  path: unknown,
): void {
  if (!isString(name)) {
    throw atMakeState.type`Invalid name: ${getTypeDescription(name)}. Expected string.`;
  }

  if (params !== undefined && !isParams(params)) {
    throw atMakeState.type`Invalid params: ${getTypeDescription(params)}. Expected plain object.`;
  }

  if (path !== undefined && !isString(path)) {
    throw atMakeState.type`Invalid path: ${getTypeDescription(path)}. Expected string.`;
  }
}

/**
 * The mode gate's opt-in diagnostic (#1575).
 *
 * Core DROPS a query key the active `queryParamsMode` will not print — always-on
 * and silent, so `state.search` can never carry what `state.path` does not show.
 * The drop is correct but invisible, and the two ways to hit it look nothing
 * alike from the outside:
 *
 * - a caller passing a key the route never declared with `?name`;
 * - a `defaultSearch` entry for such a key, which is simply DEAD CONFIG under
 *   `default` / `strict` — nothing the caller wrote is wrong, the route config
 *   just cannot take effect.
 *
 * One message covers both: core cannot tell them apart at the drop, and a guess
 * would be worse than the plain fact. Warn rather than throw — the mode is a
 * serialization option, not an error policy, and turning it into one would give
 * three behaviours for a single rule (RFC §4.7).
 *
 * De-duplicated per `route + key`: the gate runs on every navigation and every
 * `matchPath`, so an un-deduped warning would flood a dev console the moment a
 * route is revisited.
 *
 * ⚠ **The cache belongs to the ROUTER, not to the module (#1583).** A `Set` at
 * module scope is one per PROCESS: the first router to report a `route + key`
 * silenced every router after it, so under SSR / SSG the diagnostic fired for
 * request #1 and stayed quiet for the life of the process — precisely backwards
 * for a dev-time signal. It also survived `teardown()`, so re-registering the
 * plugin bought silence, and it grew without bound because nothing evicted.
 *
 * A factory rather than a `WeakMap<Router, Set>`: `buildValidatorObject` already
 * runs once per registration, so closing over a fresh `Set` there gives
 * per-router lifetime, per-router isolation and collection with the router at
 * zero new module state — and it retires the two `reset*` test seams, which
 * existed only to work around the module scope.
 */
export function createDroppedQueryKeyReporter(): (
  routeName: string,
  key: string,
) => void {
  const reported = new Set<string>();

  return function reportDroppedQueryKey(routeName: string, key: string): void {
    const seen = `${routeName} ${key}`;

    if (reported.has(seen)) {
      return;
    }

    reported.add(seen);

    console.warn(
      `[router] Query key "${key}" is not declared on route "${routeName}" (\`?${key}\`), so the ` +
        `current \`queryParamsMode\` will not print it — it was dropped from \`state.search\` rather ` +
        `than published beside a \`state.path\` that cannot show it. Declare it on the route path, ` +
        `or use \`queryParamsMode: "loose"\` to keep undeclared keys. A \`defaultSearch\` entry for ` +
        `"${key}" is dead config in this mode for the same reason.`,
    );
  };
}

/**
 * The undeclared-params-bag diagnostic (#1579 — the params half of #1553).
 *
 * A key the route declares NOWHERE — neither as a path slot nor with `?` — has
 * no channel to own it, so core keeps it in `state.params` as app-level data
 * (documented: wiki `Route.md`). Correct, but it means the state does not
 * round-trip through its own `state.path`: reopen the same link and the key is
 * gone.
 *
 * Core's behaviour is deliberately UNCHANGED — dropping the key was measured
 * and rejected. It retires a shipped capability (52 tests across 6 packages plus
 * the wiki), and the "declared nowhere" predicate cannot separate that case from
 * a legitimate one: `navigate("users", { id })` on a PARENT route whose child
 * declares `:id` is indistinguishable from a typo. A diagnostic can afford that
 * ambiguity — it says what happened and lets the developer judge; a gate cannot.
 *
 * De-duplicated per `route + key`, like the mode gate's: this runs on every
 * navigation, so an un-deduped warning floods the console on a revisit — and
 * per ROUTER, for the same reasons and by the same factory shape (#1583).
 */
export function createUndeclaredParamKeyReporter(): (
  routeName: string,
  key: string,
) => void {
  const undeclaredReported = new Set<string>();

  return function reportUndeclaredParamKey(
    routeName: string,
    key: string,
  ): void {
    const seen = `${routeName} ${key}`;

    if (undeclaredReported.has(seen)) {
      return;
    }

    undeclaredReported.add(seen);

    console.warn(
      `[router] Param "${key}" is declared nowhere on route "${routeName}" — neither as a path ` +
        `slot (:${key}) nor as a query param (?${key}), so it stays in state.params but never ` +
        `reaches the URL. The state will not round-trip: matchPath(state.path) cannot recover ` +
        `it. Declare it on the route path if it belongs in the URL, or pass it through the ` +
        `search channel; keep it here only if it is deliberately app-level data.`,
    );
  };
}

type ReportCodecRoundTrip = RouterValidator["state"]["reportCodecRoundTrip"];

type RouteCodec = Parameters<ReportCodecRoundTrip>[1];

type Channel = keyof ParamsSearch;

/** Both channels as this diagnostic reads them: bags it did not build. */
type Bags = Record<Channel, Readonly<Record<string, unknown>>>;

/** What the round trip through a route's codec did to one key. */
type Loss = "added" | "changed" | "dropped";

function isBag(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One codec pass over both channels, as core makes it: each channel is handed
 * over as a copy, and a channel the codec does not return keeps the one it was
 * handed (#2896). `undefined` when a channel it returns is not a bag, which
 * this diagnostic does not judge.
 */
function codecPass(
  codec: RouteCodec["encode"],
  channels: Bags,
): Bags | undefined {
  const handed = {
    params: { ...channels.params },
    search: { ...channels.search },
  };

  if (codec === undefined) {
    return handed;
  }

  const returned: Partial<Record<Channel, unknown>> = codec(
    handed as ParamsSearch,
  );
  const params = returned.params ?? handed.params;
  const search = returned.search ?? handed.search;

  return isBag(params) && isBag(search) ? { params, search } : undefined;
}

/** The encoder's answer for a value it may not be able to print. */
function tryCodecPass(
  codec: RouteCodec["encode"],
  channels: Bags,
): Bags | undefined {
  try {
    return codecPass(codec, channels);
  } catch {
    return undefined;
  }
}

/** The keys of a bag whose value is defined: `undefined` is absence. */
function definedEntries(
  bag: Readonly<Record<string, unknown>>,
): Map<string, unknown> {
  return new Map(entriesOf(bag).filter(([, value]) => value !== undefined));
}

/** A path slot as a URL gives it back: a number or a boolean as its string. */
function printedSlot(value: unknown): unknown {
  return typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : value;
}

/**
 * What a reload hands `decodeParams` in place of the encoded channels: a URL
 * carries no params key outside the path slots, and a slot only as a string.
 */
function reloadedFrom(encoded: Bags, pathSlots: readonly string[]): Bags {
  const params = definedEntries(encoded.params);

  return {
    params: Object.fromEntries(
      pathSlots
        .filter((slot) => params.has(slot))
        .map((slot) => [slot, printedSlot(params.get(slot))]),
    ),
    search: encoded.search,
  };
}

function holdsObject(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((element) => holdsObject(element));
  }

  return typeof value === "object" && value !== null;
}

/**
 * Whether a value and its round-tripped twin print alike — the rule
 * `areStatesEqual(…, false)` compares values by (#1554).
 *
 * ⚑ **An object compares by the piece the route's encoder prints for it.** A
 * URL carries an object only as that piece, so a `Date` decoded into a fresh
 * `Date` of the same instant is the same value; by identity every such codec
 * would be reported.
 */
function printsAlike(
  given: unknown,
  back: unknown,
  pieces: () => readonly [unknown, unknown],
): boolean {
  if (areParamValuesEqual(given, back)) {
    return true;
  }

  if (!holdsObject(given) && !holdsObject(back)) {
    return false;
  }

  const [givenPiece, backPiece] = pieces();

  return areParamValuesEqual(givenPiece, backPiece);
}

/**
 * The keys a reload of the URL a state prints does not give back as the state
 * carries them.
 *
 * ⚑ **A params key outside `pathSlots` is never reported as dropped.** It is
 * app-level data no URL carries (#1553), and the undeclared-key diagnostic
 * reports it. Every key of `state.search` is in the URL: the mode gate keeps
 * no other (#1575).
 *
 * ⚠ **The query channel reaches the decoder as `encodeParams` returned it.** A
 * reload hands over the URL's parse of it instead, and the router's
 * `queryParams` formats decide that parse: a numeric string can come back as a
 * number.
 */
function roundTripLosses(
  state: Bags,
  codec: RouteCodec,
  pathSlots: readonly string[],
): [Channel, string, Loss][] {
  const encoded = codecPass(codec.encode, state);

  if (encoded === undefined) {
    return [];
  }

  const decoded = codecPass(codec.decode, reloadedFrom(encoded, pathSlots));

  if (decoded === undefined) {
    return [];
  }

  // A decoded value is encoded in the state in place of the given one, so a
  // key the encoder cannot print does not fail the comparison of another; an
  // encoder that cannot print it did not get it back.
  const piecesOf = (
    channel: Channel,
    key: string,
    value: unknown,
  ): readonly [unknown, unknown] => [
    encoded[channel][key],
    tryCodecPass(codec.encode, {
      ...state,
      [channel]: { ...state[channel], [key]: value },
    })?.[channel][key],
  ];
  const losses: [Channel, string, Loss][] = [];

  for (const channel of ["params", "search"] as const) {
    const given = definedEntries(state[channel]);
    const back = definedEntries(decoded[channel]);

    for (const [key, value] of back) {
      if (!given.has(key)) {
        losses.push([channel, key, "added"]);
      } else if (
        !printsAlike(given.get(key), value, () => piecesOf(channel, key, value))
      ) {
        losses.push([channel, key, "changed"]);
      }
    }

    for (const key of given.keys()) {
      if (!back.has(key) && (channel === "search" || pathSlots.includes(key))) {
        losses.push([channel, key, "dropped"]);
      }
    }
  }

  return losses;
}

/** What the route's codec must do about a changed or dropped key. */
function remedyFor(codec: RouteCodec): string {
  if (codec.decode === undefined) {
    return "The route has an encodeParams and no decodeParams to undo it.";
  }

  return codec.encode === undefined
    ? "With no encodeParams, decodeParams must return each value so that it prints as the URL shows it."
    : "decodeParams must undo encodeParams.";
}

function describeLoss(
  routeName: string,
  channel: Channel,
  key: string,
  loss: Loss,
  codec: RouteCodec,
): string {
  const head = `Route "${routeName}": its codec`;

  switch (loss) {
    case "added": {
      return (
        `${head} adds "${key}" to state.${channel}, so a link commits a state without it and ` +
        `a reload of the same URL commits one with it. Derive "${key}" in a forwardState ` +
        `interceptor instead: navigate and matchPath both run it.`
      );
    }
    case "changed": {
      return (
        `${head} changes "${key}" in state.${channel}, so a link and a reload of the same URL ` +
        `commit different values. ${remedyFor(codec)}`
      );
    }
    case "dropped": {
      return (
        `${head} drops "${key}" from state.${channel}, so a reload of the URL a link builds ` +
        `loses it. ${remedyFor(codec)}`
      );
    }
  }
}

/**
 * The codec round-trip diagnostic (#2905).
 *
 * `navigate` takes params in the form the route's `decodeParams` returns and
 * never runs it, so a link commits the caller's params and a reload of the same
 * URL commits what the decoder makes of them. The two agree only when the
 * decoder undoes `encodeParams` and adds no key. Core asks once per state a
 * committing producer builds, for a route that has a codec; this runs the
 * pair over that state and warns about each key that does not come back.
 *
 * ⚠ **The diagnostic must never be worse than its own absence.** The codecs
 * are application code, and a throw here would fail the navigation it only
 * describes; the throw is left to the codec's real calls, `buildPath` and
 * `matchPath`.
 *
 * De-duplicated per `route + channel + key` and per ROUTER, by the factory
 * shape of its siblings above (#1583).
 */
export function createCodecRoundTripReporter(
  logger: RouterLogger,
): ReportCodecRoundTrip {
  const reported = new Set<string>();

  return function reportCodecRoundTrip(state, codec, pathSlots): void {
    let losses: [Channel, string, Loss][];

    try {
      losses = roundTripLosses(state, codec, pathSlots);
    } catch {
      return;
    }

    for (const [channel, key, loss] of losses) {
      const seen = `${state.name} ${channel} ${key}`;

      if (reported.has(seen)) {
        continue;
      }

      reported.add(seen);
      logger.warn(
        "router",
        describeLoss(state.name, channel, key, loss, codec),
      );
    }
  };
}
