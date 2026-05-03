import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRealRouter } from "@real-router/angular";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";

import { AppComponent } from "./app.component";
import { routes } from "./routes";
import { createDirectionTracker } from "../../../../../../shared/dom-utils";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

// `createDirectionTracker` MUST run before `usePlugin(browserPlugin)`.
// Both register window-level `popstate` listeners, and listeners fire
// in registration order. The browser-plugin's listener synchronously
// dispatches `subscribeLeave` — if the tracker is registered second,
// our flag setter runs *after* the leave callback has already read the
// (still-false) flag. Registering first guarantees correct ordering.
createDirectionTracker(router);

router.usePlugin(browserPluginFactory());

// All three coordinators (PageAnimator, HeroMorph, ListFlip) are
// installed via `inject*` factories inside `AppComponent`, each using
// `injectRouteExit` from `@real-router/angular`. No router-level
// install needed.

void router.start().then(() => {
  void bootstrapApplication(AppComponent, {
    providers: [provideZonelessChangeDetection(), provideRealRouter(router)],
  }).catch((error: unknown) => {
    console.error(error);
  });
});
