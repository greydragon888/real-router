// packages/router6-plugin-persistent-params/modules/types.ts

/**
 * Configuration for persistent parameters' plugin.
 * Can be either an array of parameter names or an object with default values.
 *
 * @example
 * // Array of parameter names (initial values undefined)
 * persistentParamsPlugin(['lang', 'theme'])
 *
 * @example
 * // Object with default values
 * persistentParamsPlugin({ lang: 'en', theme: 'light' })
 */
export type PersistentParamsConfig =
  | string[]
  | Record<string, string | number | boolean>;
