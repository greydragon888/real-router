import { raiser } from "@real-router/core/utils";

// The site is written above the binding that serves it, which is legal: the
// function reads the binding when it runs, not where it is written.
export function beforeItsBinding(): never {
  throw atLate.type`this site is written above the binding that serves it`;
}

const atLate = raiser("router", "matchPath");
