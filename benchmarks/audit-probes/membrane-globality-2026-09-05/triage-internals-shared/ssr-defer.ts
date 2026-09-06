// Триаж: defer·options.deferred — копируется ли контейнер вызывающего на границе,
// и сохраняется ли идентичность листьев-Promise.
import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";
import { defer, DEFER_BRAND } from "../../../../shared/ssr/defer";

const out: Record<string, unknown> = {};

const pA = Promise.resolve(1);
const pB = Promise.resolve(2);

// ПОЗИТИВНЫЙ КОНТРОЛЬ: обычный вызов проходит и брендируется.
const control = defer({ critical: { c: 1 }, deferred: { a: pA } });
out.control_branded = (control as never as Record<symbol, unknown>)[DEFER_BRAND];
out.control_leafIdentity = control.deferred.a === pA;

// СЧЁТ чтений ключей мешка вызывающего.
const bag = countingBag({ a: pA, b: pB });
const payload = defer({ critical: 0, deferred: bag.bag as never });
out.deferredKeyReads = { ...bag.reads };
out.snapshotIsCopy = payload.deferred !== bag.bag;
out.snapshotFrozen = Object.isFrozen(payload.deferred);
out.leafIdentityKept = payload.deferred.a === pA && payload.deferred.b === pB;

// ДРЕЙФ ПОСЛЕ границы: мутация мешка вызывающего не видна в снапшоте.
(bag.bag as Record<string, unknown>).c = Promise.resolve(3);
out.postMutationVisibleInSnapshot = "c" in (payload.deferred as object);
out.deferredKeyReadsAfter = { ...bag.reads };

console.log(JSON.stringify(out, null, 1));
