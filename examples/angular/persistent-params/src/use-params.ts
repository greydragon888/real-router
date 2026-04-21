import { computed, type Signal } from "@angular/core";
import { injectRoute } from "@real-router/angular";

export function useStringParam(key: string, fallback: string): Signal<string> {
  const route = injectRoute();
  return computed(() => {
    const raw = route.routeState().route?.params[key];
    return typeof raw === "string" ? raw : fallback;
  });
}
