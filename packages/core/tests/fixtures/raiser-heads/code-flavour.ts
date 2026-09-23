import { errorCodes } from "@real-router/core";
import { raiser } from "@real-router/core/utils";

// A code refusal: its tag is a CALL, `at.code(code)`, so the binding a reader
// resolves sits one member deeper than in every other flavour.
const atNavigateToState = raiser("router", "navigateToState");

export function codeFlavour(): never {
  throw atNavigateToState.code(
    errorCodes.ROUTE_NOT_FOUND,
  )`a code refusal names its binding through a call`;
}
