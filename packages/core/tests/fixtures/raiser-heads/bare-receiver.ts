import { raiser } from "@real-router/core/utils";

// A bare receiver: several doors reach the raiser, so it names none.
const atRouter = raiser("router");

export function bareReceiver(): never {
  throw atRouter.plain`a bare receiver names no door at all`;
}
