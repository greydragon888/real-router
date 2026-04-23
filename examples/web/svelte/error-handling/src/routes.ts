import type { GuardFnFactory, Route } from "@real-router/core";

function protectedGuardFn(): boolean {
  return false;
}

const protectedGuard: GuardFnFactory = () => protectedGuardFn;

function slowGuardFn(
  _toState: unknown,
  _fromState: unknown,
  signal?: AbortSignal,
): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve(true);
    }, 5000);

    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

const slowGuard: GuardFnFactory = () => slowGuardFn;

export const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "protected", path: "/protected", canActivate: protectedGuard },
  { name: "slow", path: "/slow", canActivate: slowGuard },
];
