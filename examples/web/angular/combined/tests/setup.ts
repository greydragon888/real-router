import "@angular/compiler";
import { setupTestBed } from "@analogjs/vitest-angular/setup-testbed";

setupTestBed({
  zoneless: true,
  teardown: { destroyAfterEach: true },
});
