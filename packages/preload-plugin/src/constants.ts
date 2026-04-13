import type { PreloadPluginOptions } from "./types";

export const defaultOptions: Required<PreloadPluginOptions> = {
  delay: 65,
  networkAware: true,
};

export const GHOST_EVENT_THRESHOLD = 2500;

export const TOUCH_SCROLL_THRESHOLD = 10;

export const TOUCH_PRELOAD_DELAY = 100;

export const LISTENER_OPTIONS: AddEventListenerOptions = {
  capture: true,
  passive: true,
};
