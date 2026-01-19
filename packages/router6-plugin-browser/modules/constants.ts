// packages/router6-plugin-browser/modules/constants.ts

/**
 * Internal type for default options.
 *
 * Why separate type instead of BrowserPluginOptions?
 *
 * BrowserPluginOptions is a discriminated union:
 * - HashModeOptions: allows hashPrefix, forbids preserveHash (never)
 * - HistoryModeOptions: allows preserveHash, forbids hashPrefix (never)
 *
 * We cannot create a single object of type BrowserPluginOptions that contains
 * BOTH hashPrefix and preserveHash - one will always be 'never' depending on useHash.
 *
 * Example - this would fail TypeScript:
 * const defaults: BrowserPluginOptions = {
 *   useHash: false,      // → HistoryModeOptions branch
 *   preserveHash: true,  // ✅ OK
 *   hashPrefix: ""       // ❌ Error: Type 'string' is not assignable to type 'never'
 * };
 *
 * DefaultBrowserPluginOptions solves this by containing ALL options,
 * enabling:
 * - Default values for every option
 * - Type validation via typeof defaultOptions
 * - Runtime validation of user-provided option types
 */
export interface DefaultBrowserPluginOptions {
  forceDeactivate: boolean;
  useHash: boolean;
  base: string;
  mergeState: boolean;
  preserveHash: boolean;
  hashPrefix: string;
}

export const defaultOptions: DefaultBrowserPluginOptions = {
  forceDeactivate: true,
  useHash: false,
  hashPrefix: "",
  base: "",
  mergeState: false,
  preserveHash: true,
};

/**
 * Source identifier for transitions triggered by browser events.
 * Used to distinguish browser-initiated navigation (back/forward buttons)
 * from programmatic navigation (router.navigate()).
 */
export const source = "popstate";

export const LOGGER_CONTEXT = "router6-plugin-browser";
