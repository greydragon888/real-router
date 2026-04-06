import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

function setGlobal(name: string, value: unknown) {
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
setGlobal("Element", dom.window.Element);
setGlobal("Node", dom.window.Node);
setGlobal("MouseEvent", dom.window.MouseEvent);
setGlobal("MutationObserver", dom.window.MutationObserver);
setGlobal("sessionStorage", dom.window.sessionStorage);
setGlobal("localStorage", dom.window.localStorage);
setGlobal("getComputedStyle", dom.window.getComputedStyle.bind(dom.window));
setGlobal("addEventListener", dom.window.addEventListener.bind(dom.window));
setGlobal(
  "removeEventListener",
  dom.window.removeEventListener.bind(dom.window),
);
setGlobal(
  "requestAnimationFrame",
  dom.window.requestAnimationFrame?.bind(dom.window) ??
    ((callback: (time: number) => void) =>
      setTimeout(() => callback(performance.now()), 16)),
);
setGlobal(
  "cancelAnimationFrame",
  dom.window.cancelAnimationFrame?.bind(dom.window) ??
    ((handle: number) => clearTimeout(handle)),
);

dom.window.scrollTo = () => {};

export { dom };
export const window = dom.window;
