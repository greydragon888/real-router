export { createDirectionTracker } from "./direction-tracker";

export { createRouteAnnouncer } from "./route-announcer";

export { createScrollRestoration } from "./scroll-restore";

export { createScrollSpy } from "./scroll-spy";

export { createViewTransitions } from "./view-transitions";

export {
  shouldNavigate,
  targetsAnotherContext,
  anchorTargetsAnotherContext,
  buildHref,
  buildActiveClassName,
  navigateWithHash,
  resolveLinkTarget,
  shallowEqual,
  applyLinkA11y,
} from "./link-utils";

export type { RouteAnnouncerOptions } from "./route-announcer";

export type { ScrollRestorationOptions } from "./scroll-restore";

export type { ScrollSpy, ScrollSpyOptions } from "./scroll-spy";
