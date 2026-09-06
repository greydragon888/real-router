// P3 for the un-censused entry `RouterError.setErrorInstance·err`: the three
// fields are written onto `this` with plain assignment ([[Set]]), not `putField`
// as the constructor and `setAdditionalFields` do. An ambient accessor on the
// chain (`Object.prototype`) therefore decides where the value lands.
import { RouterError } from "@real-router/core";

const seen: unknown[] = [];

// POSITIVE CONTROL first: clean chain.
const clean = new RouterError("X");
const leaf = { why: "leaf" };
const src = new Error("orig");

(src as { cause?: unknown }).cause = leaf;
clean.setErrorInstance(src);

const control = {
  ownCause: Object.hasOwn(clean, "cause"),
  causeByReference: (clean as unknown as { cause: unknown }).cause === leaf,
};

// Ambient setter under the same name.
Object.defineProperty(Object.prototype, "cause", {
  configurable: true,
  set(v: unknown) {
    seen.push(v);
  },
  get() {
    return "HIJACKED";
  },
});

const hijacked = new RouterError("X");

hijacked.setErrorInstance(src);

const result = {
  control,
  ownCauseAfterAmbientSetter: Object.hasOwn(hijacked, "cause"),
  readsBackAs: (hijacked as unknown as { cause: unknown }).cause,
  ambientSetterCalls: seen.length,
};

delete (Object.prototype as { cause?: unknown }).cause;

console.log(JSON.stringify(result, null, 1));
