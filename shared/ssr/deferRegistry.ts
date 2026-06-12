/**
 * Client-side registry for deferred values streamed from the server.
 *
 * The contract spans three actors:
 *
 * 1. **Server stream injects `<script>__rrDefer__("key", "json")</script>`
 *    tags** as each loader-returned promise resolves. The bootstrap script
 *    (also server-emitted) installs `__rrDefer__` and the registry on
 *    `globalThis` before any settle script runs.
 *
 * 2. **Plugin start interceptor** (post-hydration scratchpad path) reads the
 *    `<deferredKeysNamespace>` list from the hydrated state, then calls
 *    `ensureRegistryPromise(key)` once per key to obtain the promise that
 *    `useDeferred()` will return. This ensures a stable Promise reference
 *    across the initial render and any inline-script settlements.
 *
 * 3. **Adapter `useDeferred(key)`** reads from `state.context.<deferredNamespace>`
 *    which the plugin populated above. The returned Promise integrates with
 *    React `use()`, Solid `<Await/>`, Svelte `{#await}`, etc.
 */

interface RegistryEntry {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

const REGISTRY_GLOBAL_KEY = "__rrDeferRegistry__";
const SETTLE_FN_NAME = "__rrDefer__";
const REJECT_FN_NAME = "__rrDeferError__";

interface DeferGlobal {
  [REGISTRY_GLOBAL_KEY]?: Map<string, RegistryEntry>;
  [SETTLE_FN_NAME]?: (key: string, json: string) => void;
  [REJECT_FN_NAME]?: (key: string, json: string) => void;
}

function getGlobal(): DeferGlobal {
  return globalThis as unknown as DeferGlobal;
}

function getOrCreateRegistry(): Map<string, RegistryEntry> {
  const g = getGlobal();
  let registry = g[REGISTRY_GLOBAL_KEY];

  if (registry === undefined) {
    registry = new Map<string, RegistryEntry>();
    g[REGISTRY_GLOBAL_KEY] = registry;
  }

  return registry;
}

/**
 * Returns the registered Promise for `key`, creating a fresh pending entry on
 * first access. Stable across calls — `useDeferred` relies on Promise
 * reference identity for React `use()` to track resolution.
 */
export function ensureRegistryPromise(key: string): Promise<unknown> {
  const registry = getOrCreateRegistry();
  let entry = registry.get(key);

  if (entry === undefined) {
    let resolve!: (value: unknown) => void;
    let reject!: (error: unknown) => void;

    const promise = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    entry = { promise, resolve, reject };
    registry.set(key, entry);
  }

  return entry.promise;
}

/**
 * Returns the inline bootstrap script (no `<script>` wrapper). Embed in a
 * `<script>` tag emitted **once before any `__rrDefer__()` call lands** in
 * the response stream. Idempotent — re-installing is a no-op.
 *
 * The script source is kept terse (ES5-ish, no template literals, no
 * arrow functions) so it works without transpilation in legacy browsers and
 * stays under ~600 bytes uncompressed.
 */
export function getDeferBootstrapScript(): string {
  // The script idempotently installs __rrDefer__/__rrDeferError__ on `g`. If
  // the registry already exists (e.g. from a prior call to
  // ensureRegistryPromise on the client adapter), reuse it — only the settle
  // functions are (re)assigned. This handles the realistic ordering:
  // adapter creates the registry during hydration; the first settle script
  // arriving in the response stream installs the global functions.
  return (
    "(function(g){" +
    `var R=g.${REGISTRY_GLOBAL_KEY};` +
    `if(!R)R=g.${REGISTRY_GLOBAL_KEY}=new Map();` +
    "function E(k){" +
    "var e=R.get(k);" +
    "if(!e){" +
    "var rs,rj;" +
    "var p=new Promise(function(r,j){rs=r;rj=j});" +
    "e={promise:p,resolve:rs,reject:rj};" +
    "R.set(k,e)" +
    "}" +
    "return e" +
    "}" +
    `g.${SETTLE_FN_NAME}=function(k,j){E(k).resolve(JSON.parse(j))};` +
    `g.${REJECT_FN_NAME}=function(k,j){` +
    "var d=JSON.parse(j);" +
    'var er=new Error(d&&d.message?d.message:"deferred error");' +
    "if(d&&d.name)er.name=d.name;" +
    "E(k).reject(er)" +
    "}" +
    "})(typeof globalThis!=='undefined'?globalThis:" +
    "(typeof window!=='undefined'?window:self));"
  );
}

// Single-pass replacement table for the chars escapeForScript must encode
// as `\uXXXX` to keep them out of the raw HTML parser. Five consecutive
// `replace` / `split`+`join` passes used to walk the string for each
// codepoint; the regex + lookup form does it in one pass — ~1.6× faster
// on large payloads, indistinguishable on short keys (the common case).
//
// Roundtrip + HTML-safety properties are pinned by the
// `escapeForScript: pure-function security invariants` PBT block in
// `tests/property/ssr-data.properties.ts` (numRuns: 1000).
//
// Built at module init via `String.fromCodePoint(...)` so the source file
// itself never contains raw U+2028 / U+2029 codepoints (which would
// terminate string literals / regex literals at parse time on legacy
// JS engines and even in modern TS parsers under some configs).
const ESCAPE_FOR_SCRIPT_PAIRS: readonly (readonly [string, string])[] = [
  ["<", String.raw`\u003c`],
  [">", String.raw`\u003e`],
  ["&", String.raw`\u0026`],
  [String.fromCodePoint(0x20_28), String.raw`\u2028`],
  [String.fromCodePoint(0x20_29), String.raw`\u2029`],
] as const;
const ESCAPE_FOR_SCRIPT_TABLE: Record<string, string> = Object.fromEntries(
  ESCAPE_FOR_SCRIPT_PAIRS,
);
const ESCAPE_FOR_SCRIPT_REGEX = new RegExp(
  `[${ESCAPE_FOR_SCRIPT_PAIRS.map(([c]) => c).join("")}]`,
  "g",
);

/**
 * Encode an arbitrary string as a **JS string literal** that is also safe to
 * embed inside a `<script>...</script>` body. Returns the literal **with**
 * surrounding quotes — drop it directly into a script template.
 *
 * Encoding via Unicode escapes (`\uXXXX`) means:
 * - The raw HTML parser sees no `<`, `>`, U+2028, or U+2029 — so it cannot
 *   terminate the script tag prematurely (`</script>`, `<!--`) or trigger
 *   legacy JS line-terminator interpretation.
 * - The JS parser interprets `<`/`>`/`U+2028`/`U+2029` back to
 *   their original chars, so the runtime string value is bit-identical to
 *   the input.
 * - Crucially, the same encoding works for two consumer paths:
 *     1. **Plain JS literal** (e.g. the deferred KEY): the JS parser hands
 *        back the original string directly.
 *     2. **JS literal containing JSON** (e.g. the deferred VALUE): the JS
 *        parser hands back a string with `<` text inside (the leading
 *        `\\` of `\\u003c` escaped to `\`, then `u003c` is plain text), and
 *        `JSON.parse` then unescapes `<` → `<`. Net round-trip is
 *        identity.
 *   Both decode paths land on the original string — so the same
 *   `escapeForScript` works for both keys (parsed as JS literal) and values
 *   (parsed as JS literal containing JSON).
 *
 * The `&` → `&` substitution defends against `<![CDATA[` / template
 * engine post-processing that might re-interpret HTML entities; it is not
 * strictly necessary for `<script>` body parsing but cheap and conservative.
 */
export function escapeForScript(value: string): string {
  // The TS contract is `value: string`, but a cast at a callsite or a
  // misbehaving custom serializer can still smuggle a non-string through.
  // Three failure modes JSON.stringify can have on non-strings:
  //   - returns `undefined` (`stringify(undefined)`, `stringify(symbol)`,
  //     `stringify(function)`),
  //   - throws (`stringify(bigint)` → `TypeError`,
  //     `stringify(circular)` → `TypeError`),
  //   - returns `"null"` (already safe for our pipeline).
  // Catch both and emit the JSON `null` literal — the safest single-token
  // representation that JSON.parse will accept downstream.
  let json: string | undefined;

  try {
    json = JSON.stringify(value);
  } catch {
    json = undefined;
  }

  if (typeof json !== "string") {
    return "null";
  }

  return json.replace(
    ESCAPE_FOR_SCRIPT_REGEX,
    // The `?? c` arm is structurally unreachable — the regex char class is
    // built from the table's own keys, so every match has a table entry; the
    // fallback only satisfies the `string | undefined` index signature.
    /* v8 ignore next -- @preserve: TS index-access fallback, regex ⊆ table keys */
    (c) => ESCAPE_FOR_SCRIPT_TABLE[c] ?? c,
  );
}

/**
 * Format a single settle script for one resolved promise.
 * Output: `<script>__rrDefer__("key","jsonString")</script>`. Both `key`
 * and `serializedValue` are user-controlled in the general case (route
 * params can flow into deferred-map keys; loader returns flow into values),
 * so both go through {@link escapeForScript}.
 */
export function formatSettleScript(
  key: string,
  serializedValue: string,
  isError: boolean,
): string {
  const fn = isError ? REJECT_FN_NAME : SETTLE_FN_NAME;
  const safeKey = escapeForScript(key);
  const safeValue = escapeForScript(serializedValue);

  return `<script>${fn}(${safeKey},${safeValue})</script>`;
}

/** Test-only — clears the global registry. Not exported from index.ts. */
export function __resetRegistryForTests(): void {
  const g = getGlobal();
  delete g[REGISTRY_GLOBAL_KEY];
  delete g[SETTLE_FN_NAME];
  delete g[REJECT_FN_NAME];
}
