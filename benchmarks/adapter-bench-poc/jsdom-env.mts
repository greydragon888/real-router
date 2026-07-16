/**
 * jsdom global shim — resurrected from the retired vs-tanstack harness
 * (`git show fcd6c86d^:benchmarks/vs-tanstack/shared/jsdom.ts`), trimmed to
 * what react-dom + the adapter's dom-utils touch. Import this module FIRST
 * (side-effect) — before dynamically importing dist/app.mjs.
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

function setGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

setGlobal("window", dom.window);
setGlobal("document", dom.window.document);
setGlobal("self", dom.window);
setGlobal("navigator", dom.window.navigator);
setGlobal("location", dom.window.location);
setGlobal("history", dom.window.history);
setGlobal("HTMLElement", dom.window.HTMLElement);
setGlobal("HTMLAnchorElement", dom.window.HTMLAnchorElement);
setGlobal("HTMLIFrameElement", dom.window.HTMLIFrameElement);
setGlobal("Element", dom.window.Element);
setGlobal("Node", dom.window.Node);
setGlobal("Text", dom.window.Text);
setGlobal("Comment", dom.window.Comment);
setGlobal("DocumentFragment", dom.window.DocumentFragment);
setGlobal("MouseEvent", dom.window.MouseEvent);
// NOTE: deliberately NOT shimming `Event`/`CustomEvent` — Node 24 has native
// ones, and tinybench's Bench extends Node's EventTarget, which rejects
// jsdom's foreign Event instances (ERR_INVALID_ARG_TYPE on dispatchEvent).
setGlobal("MutationObserver", dom.window.MutationObserver);
setGlobal("SVGElement", dom.window.SVGElement);
setGlobal("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));
setGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
  setTimeout(() => {
    cb(performance.now());
  }, 0),
);
setGlobal("cancelAnimationFrame", (id: number) => {
  clearTimeout(id);
});
