import { mergeApplicationConfig, type ApplicationConfig } from "@angular/core";
import { provideServerRendering, withAppShell, withRoutes } from "@angular/ssr";

import { AppComponent } from "./app.component";
import { appConfig } from "./app.config";
import { serverRoutes } from "./app.routes.server";

const serverOnlyConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(
      withRoutes(serverRoutes),
      withAppShell(AppComponent),
    ),
  ],
};

export const serverConfig = mergeApplicationConfig(appConfig, serverOnlyConfig);
