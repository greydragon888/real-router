import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { provideRealRouter } from "@real-router/angular";
import { browserPluginFactory } from "@real-router/browser-plugin";
import { createRouter } from "@real-router/core";

import { AppComponent } from "./app.component";
import { routes } from "./routes";

const router = createRouter(routes, {
  defaultRoute: "home",
  allowNotFound: true,
});

router.usePlugin(browserPluginFactory());

void router.start().then(() => {
  void bootstrapApplication(AppComponent, {
    providers: [provideZonelessChangeDetection(), provideRealRouter(router)],
  }).catch((err: unknown) => {
    console.error(err);
  });
});
