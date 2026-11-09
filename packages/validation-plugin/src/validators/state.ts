// packages/validation-plugin/src/validators/state.ts

import { raiser } from "@real-router/core/utils";
import { areParamValuesEqual } from "@real-router/core/validation";

import { isString, isParams, getTypeDescription } from "../type-guards";

import type {
  Params,
  ParamsSearch,
  RouterLogger,
  RouterValidator,
  SearchParams,
  SimpleState,
  State,
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

/**
 * What the round trip through a route's codec did to one key. A changed value
 * the encoder prints as one piece with its reload is `undecoded`, not the value
 * the decoder returns for that piece, or `keyless`, when two reads of one URL
 * decode values that never compare equal.
 */
type Loss = "added" | "changed" | "dropped" | "undecoded" | "keyless";

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

function holdsObject(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((element) => holdsObject(element));
  }

  return typeof value === "object" && value !== null;
}

/** What a reload of a path commits: the route's `matchPath` (#2905). */
export type ReloadPath = (path: string) => State | undefined;

/**
 * A second read of a URL, which may fail where the first did not: it then
 * gives nothing back.
 */
function tryReload(reload: ReloadPath, path: string): State | undefined {
  try {
    return reload(path);
  } catch {
    return undefined;
  }
}

/** `PluginApi.forwardState`: the forward chain, after its door's checks (#2905). */
export type ForwardState = (
  routeName: string,
  routeParams: Params,
  routeSearch: SearchParams,
) => SimpleState;

/** Some keys of each channel, with their values. */
type KeysByChannel = Readonly<Record<Channel, ReadonlyMap<string, unknown>>>;

/** The keys a reload gives back and the state does not carry. */
function addedKeys(state: Bags, back: Bags): KeysByChannel {
  const added = (channel: Channel): Map<string, unknown> => {
    const given = definedEntries(state[channel]);

    return new Map(
      [...definedEntries(back[channel])].filter(([key]) => !given.has(key)),
    );
  };

  return { params: added("params"), search: added("search") };
}

/** A bag without some of its keys. */
function withoutKeys<Bag extends object>(
  bag: Bag,
  keys: ReadonlyMap<string, unknown>,
): Bag {
  return Object.fromEntries(
    entriesOf(bag).filter(([name]) => !keys.has(name)),
  ) as Bag;
}

/**
 * The keys a reload adds that the forward chain gives back alike when it runs
 * once more, over the reload without them: those are the interceptors', even
 * where the codec adds the same value. A throw while the chain runs, or while
 * its answer is read or compared, gives none back.
 */
function creditedKeys(
  back: State,
  forward: ForwardState,
  added: KeysByChannel,
): KeysByChannel {
  if (added.params.size + added.search.size === 0) {
    return added;
  }

  try {
    const answer = forward(
      back.name,
      withoutKeys(back.params, added.params),
      withoutKeys(back.search, added.search),
    );
    const givenBack = (channel: Channel): Map<string, unknown> => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- an interceptor can answer without a query bag, and `PluginApi.forwardState` hands that back as it is
      const carried = definedEntries(answer[channel] ?? {});

      return new Map(
        [...added[channel]].filter(
          ([key, value]) =>
            carried.has(key) && areParamValuesEqual(carried.get(key), value),
        ),
      );
    };

    return { params: givenBack("params"), search: givenBack("search") };
  } catch {
    return { params: new Map(), search: new Map() };
  }
}

/** One state's round trip through a reload of its path. */
interface RoundTrip {
  readonly state: Bags;
  readonly codec: RouteCodec;
  readonly pathSlots: readonly string[];
  readonly encoded: Bags;
  readonly back: State;
  /** A second reload of the same path, read once, and only when asked. */
  readonly readAgain: () => Bags | undefined;
  /** The keys a reload adds that are the interceptors' (`creditedKeys`). */
  readonly credited: KeysByChannel;
}

/**
 * Whether the encoder prints a decoded value as it printed the given one. The
 * value is encoded in the state in place of the given one, so a key the encoder
 * cannot print does not fail the comparison of another; an encoder that cannot
 * print it did not get it back.
 */
function printsAlike(
  trip: RoundTrip,
  channel: Channel,
  key: string,
  value: unknown,
): boolean {
  const printed = tryCodecPass(trip.codec.encode, {
    ...trip.state,
    [channel]: { ...trip.state[channel], [key]: value },
  });

  return (
    printed !== undefined &&
    areParamValuesEqual(trip.encoded[channel][key], printed[channel][key])
  );
}

/**
 * `added` for a key a reload gives back and the state does not carry, unless
 * it is the interceptors' (`creditedKeys`).
 */
function addedKey(
  trip: RoundTrip,
  channel: Channel,
  key: string,
): Loss | undefined {
  return trip.credited[channel].has(key) ? undefined : "added";
}

/**
 * What the round trip did to a key the state carries, `undefined` when a reload
 * gives it back. When a reload returns an object that prints alike without
 * comparing equal, the URL cannot carry the difference, and a second reload of
 * the same path tells a value the decoder does not return from one with no key.
 */
function lossOf(
  trip: RoundTrip,
  channel: Channel,
  key: string,
  given: unknown,
  value: unknown,
): Loss | undefined {
  if (!holdsObject(value)) {
    return areParamValuesEqual(given, value) ? undefined : "changed";
  }

  if (!printsAlike(trip, channel, key, value)) {
    return "changed";
  }

  if (areParamValuesEqual(given, value)) {
    return undefined;
  }

  return areParamValuesEqual(value, trip.readAgain()?.[channel][key])
    ? "undecoded"
    : "keyless";
}

/** What the round trip did to the keys of one channel. */
function channelLosses(
  trip: RoundTrip,
  channel: Channel,
): [Channel, string, Loss][] {
  const given = definedEntries(trip.state[channel]);
  const back = definedEntries(trip.back[channel]);
  const losses: [Channel, string, Loss][] = [];

  for (const [key, value] of back) {
    const loss = given.has(key)
      ? lossOf(trip, channel, key, given.get(key), value)
      : addedKey(trip, channel, key);

    if (loss !== undefined) {
      losses.push([channel, key, loss]);
    }
  }

  for (const key of given.keys()) {
    if (
      !back.has(key) &&
      (channel === "search" || trip.pathSlots.includes(key))
    ) {
      losses.push([channel, key, "dropped"]);
    }
  }

  return losses;
}

/**
 * The keys a reload of a state's path does not give back as the state carries
 * them. The reload is the router's `matchPath` without its path rebuild, so
 * the router's query formats parse the URL, `decodeParams` and the
 * `forwardState` interceptors run, and the route's defaults merge, as on a
 * real reload. A value comes back when `areParamValuesEqual` says so — the
 * rule `areStatesEqual(…, false)` compares values by (#1554, #2905) — and an
 * object only when the encoder also prints it as it printed the given value,
 * because a real reload prints its URL from what it decodes
 * (`rewritePathOnMatch`, on by default).
 *
 * ⚑ **A params key outside `pathSlots` is never reported as dropped.** It is
 * app-level data no URL carries (#1553), and the undeclared-key diagnostic
 * reports it. Every key of `state.search` is in the URL: the mode gate keeps
 * no other (#1575).
 *
 * ⚠ **A loss the URL's own format makes is reported as the codec's.** A value
 * the query format does not print, such as an empty array, is dropped by the
 * reload whichever codec the route has.
 *
 * ⚠ **What an interceptor does differently on a reload is reported as the
 * codec's**, except a key the reload adds that the chain gives back from the
 * reload without the keys it adds. A reload runs the forward chain over what
 * the URL hands it, such as a number the query format types.
 *
 * ⚠ **A key an interceptor derives from one the codec adds is reported as the
 * codec's too**: without the codec's key, the chain does not give it back.
 *
 * ⚠ **The interceptors run again on the reload**, once more when it adds keys,
 * and once more when an object prints alike without comparing equal.
 *
 * ⚠ A path that matches no route, or another route, is not judged.
 */
function roundTripLosses(
  state: State,
  codec: RouteCodec,
  pathSlots: readonly string[],
  reload: ReloadPath,
  forward: ForwardState,
): [Channel, string, Loss][] {
  const back = reload(state.path);

  if (back?.name !== state.name) {
    return [];
  }

  const encoded = codecPass(codec.encode, state);

  if (encoded === undefined) {
    return [];
  }

  let again: { readonly state: Bags | undefined } | undefined;
  const readAgain = (): Bags | undefined => {
    again ??= { state: tryReload(reload, state.path) };

    return again.state;
  };
  const trip: RoundTrip = {
    state,
    codec,
    pathSlots,
    encoded,
    back,
    readAgain,
    credited: creditedKeys(back, forward, addedKeys(state, back)),
  };

  return [...channelLosses(trip, "params"), ...channelLosses(trip, "search")];
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
  const changes =
    `${head} changes "${key}" in state.${channel}, so a link and a reload of the same URL ` +
    `commit different values.`;

  switch (loss) {
    case "added": {
      return (
        `${head} adds "${key}" to state.${channel}, so a link commits a state without it and ` +
        `a reload of the same URL commits one with it. Derive "${key}" in a forwardState ` +
        `interceptor instead: navigate and matchPath both run it.`
      );
    }
    case "changed": {
      return `${changes} ${remedyFor(codec)}`;
    }
    case "undecoded": {
      return (
        `${changes} encodeParams prints both as one piece of the URL, so a link must pass ` +
        `the value decodeParams returns for that piece.`
      );
    }
    case "keyless": {
      return (
        `${changes} Two reloads of one URL decode values that never compare equal: give ` +
        `the value a key — a Date, or a plain object JSON.stringify prints in full.`
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
 * committing producer builds, for a route that has a codec; this reloads the
 * state's path and warns about each key the reload does not give back.
 *
 * ⚠ **A state is judged before its navigation commits.** On the navigation
 * that removes a param an interceptor carries over from the state the router
 * is on — persistent-params-plugin's included — the interceptors still carry
 * its previous value: a key the codec adds with that value goes unreported,
 * and where the URL leaves a default out, a key can be reported though a
 * reload after the commit matches the state.
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
  reload: ReloadPath,
  forward: ForwardState,
): ReportCodecRoundTrip {
  const reported = new Set<string>();

  return function reportCodecRoundTrip(state, codec, pathSlots): void {
    let losses: [Channel, string, Loss][];

    try {
      losses = roundTripLosses(state, codec, pathSlots, reload, forward);
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
