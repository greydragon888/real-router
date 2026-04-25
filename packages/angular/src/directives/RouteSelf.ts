import { Directive, TemplateRef, inject } from "@angular/core";

@Directive({ selector: "ng-template[routeSelf]" })
export class RouteSelf {
  readonly templateRef = inject(TemplateRef);
}
