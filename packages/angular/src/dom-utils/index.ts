export { createDirectionTracker } from "./direction-tracker";

export { createRouteAnnouncer } from "./route-announcer";

export { createScrollRestoration } from "./scroll-restore";

export { createScrollSpy } from "./scroll-spy";

export { createViewTransitions } from "./view-transitions";

export {
  shouldNavigate,
  buildHref,
  buildActiveClassName,
  navigateWithHash,
  resolveLinkTarget,
  shallowEqual,
  applyLinkA11y,
} from "./link-utils";

export type { ResolvedLinkTarget } from "./link-utils";

export type { RouteAnnouncerOptions } from "./route-announcer";

export type {
  ScrollRestorationOptions,
  ScrollRestorationMode,
} from "./scroll-restore";

export type { ScrollSpy, ScrollSpyOptions } from "./scroll-spy";

export type { DirectionTracker } from "./direction-tracker";

export type { ViewTransitions } from "./view-transitions";
