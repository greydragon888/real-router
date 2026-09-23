import { raiser } from "@real-router/core/utils";

// Two bindings share one name, each in its own function. The FIRST carries a
// door that no reader may accept, so a reader that resolves a name file-wide
// hands the second binding to both sites and the planted door disappears.
export function firstBinding(): never {
  const at = raiser("router", "Segment Matcher");

  throw at.type`the first binding plants a door no reader may accept`;
}

export function secondBinding(): never {
  const at = raiser("router", "navigate");

  throw at.type`the second binding shares the first one's name`;
}
