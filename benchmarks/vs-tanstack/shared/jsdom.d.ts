declare module "jsdom" {
  class JSDOM {
    constructor(
      html?: string,
      options?: { url?: string; pretendToBeVisual?: boolean },
    );
    readonly window: Window & typeof globalThis;
  }
}
