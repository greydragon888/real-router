import { Directive, TemplateRef, inject } from "@angular/core";

@Directive({ selector: "ng-template[routeNotFound]" })
export class RouteNotFound {
  readonly templateRef = inject(TemplateRef);
}
