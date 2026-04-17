import { Directive, TemplateRef, inject, input } from "@angular/core";

@Directive({ selector: "ng-template[routeMatch]" })
export class RouteMatch {
  readonly routeMatch = input.required<string>();
  readonly templateRef = inject(TemplateRef);
}
