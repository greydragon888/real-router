export interface PreloadPluginOptions {
  /** Hover debounce delay in ms. @default 65 */
  delay?: number;
  /** Check saveData/2g and disable preloading on slow connections. @default true */
  networkAware?: boolean;
}
